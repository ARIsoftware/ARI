/**
 * Provisioning and reconciliation of the non-BYPASSRLS app role (`ari_app`).
 *
 * Phase 2 of DB-level RLS enforcement (see docs/SECURITY.md). Runs on the
 * PRIVILEGED pool at boot (instrumentation.ts), after a fresh install's
 * bootstrap, and on demand. It creates / repairs the `ari_app` login role,
 * stores its password AES-encrypted (key derived from BETTER_AUTH_SECRET —
 * the same scheme as stored API keys) in the deny-all `ari_instance` singleton,
 * and (re)applies the grants the role needs. Nothing consumes the role until
 * the app pool ships (Phase 3), so every outcome here is inert for requests.
 *
 * Prime directive: degrade, never break. This module never throws to its
 * callers, never blocks a boot on failure, and records what happened in
 * `getAppRoleStatus()` for /health.
 *
 * State machine (per process):
 *   disabled     — ARI_DISABLE_APP_ROLE kill switch is set; nothing is touched.
 *   unavailable  — no pool, no BETTER_AUTH_SECRET (pre-setup boot), or the
 *                  ari_instance columns are missing (setup.sql not applied yet).
 *   unsupported  — the DATABASE_URL role cannot CREATE/ALTER ROLE (42501);
 *                  permanent legacy mode for this install.
 *   degraded     — provisioned but a probe failed, or a secret mismatch guard
 *                  fired; the app keeps running on the privileged pool.
 *   ready        — role exists, password known, grants applied.
 *
 * Fast path (every boot): read the stored secret; if it decrypts, cache the
 * password and report ready — no lock, no probe, one SELECT. The first
 * app-pool connect in Phase 3 is the real probe; on 28P01/28000 it calls
 * `ensureAppRole({ force: true })`, which always test-connects before trusting
 * the stored secret and repairs the role if that fails.
 *
 * Full reconcile (no secret / undecryptable / forced): one checked-out client,
 * explicit transaction, `pg_advisory_xact_lock` (transaction-scoped — safe on
 * transaction-mode poolers, unlike the session lock bootstrap uses), re-read
 * under the lock, CREATE ROLE or ALTER ROLE with a fresh password, store the
 * encrypted secret + rotation stamp, grants, COMMIT, then probe AFTER commit
 * (the new password is not visible to a new connection before).
 *
 * Rotation guard (fleet-safe): a secret that exists but does not decrypt AND
 * was rotated < 15 min ago is NOT rotated — another deployment with a
 * different BETTER_AUTH_SECRET owns it; rotating would ping-pong. Status
 * becomes degraded('secret-mismatch') and the operator is told to share the
 * secret. A stale undecryptable secret IS rotated (restored foreign backup,
 * rotated BETTER_AUTH_SECRET — the privileged role can always reset it).
 */
import { randomBytes } from 'crypto'
import { Client } from 'pg'
import type { Pool, PoolClient } from 'pg'
import { pool } from '@/lib/db/pool'
import { decrypt, encrypt, isEncrypted } from '@/lib/crypto'
import { APP_ROLE_NAME, buildAppPoolConfig } from '@/lib/db/app-connection'

export type AppRoleState =
  'pending' | 'disabled' | 'unavailable' | 'unsupported' | 'degraded' | 'ready'

export interface AppRoleStatus {
  state: AppRoleState
  /** Human-readable cause for every state except ready. */
  reason?: string
  roleName: string
  /** ISO timestamp of the last password rotation, when known. */
  rotatedAt: string | null
  /** Epoch ms of the last reconcile that produced this status. */
  checkedAt: number | null
}

/** Distinct from bootstrap's 9173451 (session-level lock; do not reuse). */
export const APP_ROLE_LOCK_KEY = 9173452
/** Undecryptable secrets younger than this are someone else's — never rotate them. */
export const SECRET_MISMATCH_GRACE_MS = 15 * 60 * 1000
/** Forced reconciles (from connect failures) are rate-limited per process. */
export const FORCE_MIN_INTERVAL_MS = 60 * 1000
const PROBE_TIMEOUT_MS = 5000

/**
 * Grants the app role needs, all idempotent. Broad table privileges are
 * intentional — RLS is what narrows them, and deny-all policies guard the
 * auth/instance tables. USAGE on schema `app` is the load-bearing line: every
 * policy calls app.can_access_shared(). ALTER DEFAULT PRIVILEGES runs AS the
 * privileged role, which is the role that creates future module tables, so
 * new tables are granted automatically at CREATE time. Never `OWNER TO` —
 * non-ownership is what makes RLS apply to this role.
 */
export const APP_GRANT_STATEMENTS: readonly string[] = [
  `GRANT USAGE ON SCHEMA public TO ${APP_ROLE_NAME}`,
  `GRANT USAGE ON SCHEMA app TO ${APP_ROLE_NAME}`,
  `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE_NAME}`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE_NAME}`,
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE_NAME}`,
  // The backup RPCs are SECURITY DEFINER catalog readers; the app role has no business calling them.
  `DO $$ BEGIN
  IF to_regprocedure('public.get_all_user_tables()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_all_user_tables() FROM ${APP_ROLE_NAME};
  END IF;
  IF to_regprocedure('public.get_all_table_columns()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_all_table_columns() FROM ${APP_ROLE_NAME};
  END IF;
  IF to_regprocedure('public.get_table_row_counts()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_table_row_counts() FROM ${APP_ROLE_NAME};
  END IF;
END $$`,
]

const ROLE_ATTRIBUTES =
  'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT'

const READ_SECRET_SQL =
  'SELECT "app_role_secret" AS secret, "app_role_secret_rotated_at" AS rotated_at FROM "ari_instance" LIMIT 1'

type SecretRow = { secret: string | null; rotated_at: Date | string | null }
type Queryable = Pick<PoolClient, 'query'>

// ── per-process state ──────────────────────────────────────────────────────

let status: AppRoleStatus = {
  state: 'pending',
  roleName: APP_ROLE_NAME,
  rotatedAt: null,
  checkedAt: null,
}
let password: string | null = null
let inflight: Promise<AppRoleStatus> | null = null
let grantsInflight: Promise<boolean> | null = null
let lastForcedAt = 0

/** Test seam: wipe the module-level state between cases. */
export function _resetAppRoleStateForTests(): void {
  status = { state: 'pending', roleName: APP_ROLE_NAME, rotatedAt: null, checkedAt: null }
  password = null
  inflight = null
  grantsInflight = null
  lastForcedAt = 0
}

/** `ARI_DISABLE_APP_ROLE=1` — the env-only kill switch for the whole enforcement layer. */
export function isAppRoleDisabled(): boolean {
  const v = (process.env.ARI_DISABLE_APP_ROLE ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function getAppRoleStatus(): AppRoleStatus {
  return { ...status }
}

/** The app role's password once provisioned (Phase 3 builds its pool from it). */
export function getAppRolePassword(): string | null {
  return password
}

// ── helpers ────────────────────────────────────────────────────────────────

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function setStatus(next: Omit<AppRoleStatus, 'roleName' | 'checkedAt'>): AppRoleStatus {
  const changed = next.state !== status.state || next.reason !== status.reason
  status = { ...next, roleName: APP_ROLE_NAME, checkedAt: Date.now() }
  if (changed) {
    const line = `[app-role] ${status.state}${status.reason ? `: ${status.reason}` : ''}`
    if (status.state === 'ready' || status.state === 'disabled') console.log(line)
    else console.warn(line)
  }
  return getAppRoleStatus()
}

/** Decrypt a stored secret; null for missing, plaintext (never trusted) or key-mismatch values. */
function tryDecrypt(secret: string | null | undefined): string | null {
  if (!isEncrypted(secret)) return null
  try {
    return decrypt(secret as string)
  } catch {
    return null
  }
}

function rotatedAtIso(row: SecretRow | null): string | null {
  if (!row?.rotated_at) return null
  const d = row.rotated_at instanceof Date ? row.rotated_at : new Date(row.rotated_at)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function isFreshRotation(row: SecretRow | null, now: number): boolean {
  const iso = rotatedAtIso(row)
  return iso !== null && now - new Date(iso).getTime() < SECRET_MISMATCH_GRACE_MS
}

async function readSecret(q: Queryable): Promise<SecretRow | null> {
  const res = await q.query<SecretRow>(READ_SECRET_SQL)
  return res.rows[0] ?? null
}

/** Quote-doubling, like withUserContext() does for SET LOCAL (SET/CREATE ROLE cannot take parameters). */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

type ProbeResult = { ok: true } | { ok: false; code?: string; message: string }

/** One-off connection as the app role — the only way to know the password is live. */
async function probeConnect(candidatePassword: string): Promise<ProbeResult> {
  const url = process.env.DATABASE_URL
  if (!url) return { ok: false, message: 'DATABASE_URL not set' }
  let client: Client | null = null
  let connected = false
  try {
    client = new Client({
      ...buildAppPoolConfig(url, candidatePassword),
      connectionTimeoutMillis: PROBE_TIMEOUT_MS,
    })
    await client.connect()
    connected = true
    await client.query('SELECT 1')
    return { ok: true }
  } catch (err) {
    return { ok: false, code: pgCode(err), message: errMessage(err) }
  } finally {
    // end() only after a successful connect — pg already tore down a failed one.
    if (client && connected) await client.end().catch(() => {})
  }
}

/** 28P01 = bad password, 28000 = role missing / rejected by the pooler. Anything else is not the role's fault. */
function isAuthFailure(code: string | undefined): boolean {
  return code === '28P01' || code === '28000'
}

async function rollback(client: Queryable): Promise<void> {
  try {
    await client.query('ROLLBACK')
  } catch {
    // a dead connection cannot roll back — nothing to do
  }
}

// ── reconcile ──────────────────────────────────────────────────────────────

/**
 * Ensure the app role exists with a known password and its grants. Never
 * throws. Concurrent callers share one in-flight reconcile; forced reconciles
 * are rate-limited to one per FORCE_MIN_INTERVAL_MS per process.
 */
export async function ensureAppRole(opts: { force?: boolean } = {}): Promise<AppRoleStatus> {
  if (isAppRoleDisabled()) {
    password = null
    return setStatus({
      state: 'disabled',
      reason: 'ARI_DISABLE_APP_ROLE is set — running on the privileged role only',
      rotatedAt: null,
    })
  }
  if (!pool) {
    return setStatus({
      state: 'unavailable',
      reason: 'database pool not initialised',
      rotatedAt: null,
    })
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    return setStatus({
      state: 'unavailable',
      reason:
        'BETTER_AUTH_SECRET is not set (setup incomplete) — the app role password cannot be stored yet',
      rotatedAt: null,
    })
  }
  if (inflight) return inflight
  if (opts.force) {
    const now = Date.now()
    if (now - lastForcedAt < FORCE_MIN_INTERVAL_MS) return getAppRoleStatus()
    lastForcedAt = now
  }
  inflight = reconcile(pool, opts.force === true).finally(() => {
    inflight = null
  })
  return inflight
}

async function reconcile(p: Pool, force: boolean): Promise<AppRoleStatus> {
  let row: SecretRow | null
  try {
    row = await readSecret(p)
  } catch (err) {
    const code = pgCode(err)
    if (code === '42703' || code === '42P01') {
      return setStatus({
        state: 'unavailable',
        reason: 'ari_instance.app_role_secret is missing — lib/db/setup.sql has not applied yet',
        rotatedAt: null,
      })
    }
    return setStatus({
      state: 'degraded',
      reason: `could not read the app role secret: ${errMessage(err)}`,
      rotatedAt: null,
    })
  }

  if (!force) {
    const stored = tryDecrypt(row?.secret)
    if (stored !== null) {
      password = stored
      return setStatus({ state: 'ready', rotatedAt: rotatedAtIso(row) })
    }
  }

  return fullReconcile(p)
}

async function fullReconcile(p: Pool): Promise<AppRoleStatus> {
  let client: PoolClient
  try {
    client = await p.connect()
  } catch (err) {
    return setStatus({
      state: 'degraded',
      reason: `could not acquire a connection: ${errMessage(err)}`,
      rotatedAt: null,
    })
  }

  let inTxn = false
  try {
    await client.query('BEGIN')
    inTxn = true
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [APP_ROLE_LOCK_KEY])

    // Double-check under the lock: another process may have just repaired it.
    const row = await readSecret(client)
    const stored = tryDecrypt(row?.secret)
    if (stored !== null) {
      const probe = await probeConnect(stored)
      if (probe.ok) {
        await client.query('COMMIT')
        inTxn = false
        password = stored
        return setStatus({ state: 'ready', rotatedAt: rotatedAtIso(row) })
      }
      if (!isAuthFailure(probe.code)) {
        // Network / pooler trouble is not a credential problem — do not rotate on it.
        await client.query('COMMIT')
        inTxn = false
        return setStatus({
          state: 'degraded',
          reason: `app role connect failed: ${probe.message}`,
          rotatedAt: rotatedAtIso(row),
        })
      }
      // 28P01 / 28000: the stored password is stale or the role is gone — repair below.
    } else if (row?.secret && isFreshRotation(row, Date.now())) {
      await client.query('COMMIT')
      inTxn = false
      return setStatus({
        state: 'degraded',
        reason:
          'secret-mismatch: the stored app role password does not decrypt with this BETTER_AUTH_SECRET and was rotated less than 15 minutes ago — another deployment with a different BETTER_AUTH_SECRET manages this role; share the secret across deployments',
        rotatedAt: rotatedAtIso(row),
      })
    }

    // Repair: (re)create the role with a fresh password. Both statements are transactional.
    const fresh = randomBytes(24).toString('base64url')
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE_NAME])
    const verb = (exists.rowCount ?? 0) > 0 ? 'ALTER' : 'CREATE'
    try {
      await client.query(
        `${verb} ROLE ${APP_ROLE_NAME} WITH ${ROLE_ATTRIBUTES} PASSWORD ${sqlLiteral(fresh)}`,
      )
    } catch (err) {
      const code = pgCode(err)
      await rollback(client)
      inTxn = false
      if (code === '42501') {
        return setStatus({
          state: 'unsupported',
          reason: `the DATABASE_URL role cannot ${verb} ROLE (needs CREATEROLE) — running without DB-level RLS enforcement`,
          rotatedAt: null,
        })
      }
      if (code === '42710') {
        return setStatus({
          state: 'degraded',
          reason: 'app role was created concurrently — will reconcile on the next boot',
          rotatedAt: null,
        })
      }
      throw err
    }

    const updated = await client.query(
      'UPDATE "ari_instance" SET "app_role_secret" = $1, "app_role_secret_rotated_at" = NOW()',
      [encrypt(fresh)],
    )
    if ((updated.rowCount ?? 0) === 0) {
      await client.query(
        'INSERT INTO "ari_instance" ("app_role_secret", "app_role_secret_rotated_at") VALUES ($1, NOW())',
        [encrypt(fresh)],
      )
    }
    for (const statement of APP_GRANT_STATEMENTS) await client.query(statement)
    await client.query('COMMIT')
    inTxn = false

    // Only now is the new password visible to a new connection.
    password = fresh
    const rotatedAt = new Date().toISOString()
    const probe = await probeConnect(fresh)
    if (!probe.ok) {
      return setStatus({
        state: 'degraded',
        reason: `provisioned, but connecting as ${APP_ROLE_NAME} failed: ${probe.message}`,
        rotatedAt,
      })
    }
    return setStatus({ state: 'ready', rotatedAt })
  } catch (err) {
    if (inTxn) await rollback(client)
    return setStatus({
      state: 'degraded',
      reason: `app role reconcile failed: ${errMessage(err)}`,
      rotatedAt: null,
    })
  } finally {
    client.release()
  }
}

/**
 * Re-apply the grants (after module DDL, a setup.sql re-apply, or a 42501 on
 * a brand-new table). No-op unless the role has been provisioned in this
 * process. Never throws; returns whether the sweep completed.
 */
export async function ensureAppGrants(): Promise<boolean> {
  if (isAppRoleDisabled() || !pool) return false
  if (status.state !== 'ready' && status.state !== 'degraded') return false
  if (grantsInflight) return grantsInflight
  grantsInflight = applyGrants(pool).finally(() => {
    grantsInflight = null
  })
  return grantsInflight
}

async function applyGrants(p: Pool): Promise<boolean> {
  let client: PoolClient
  try {
    client = await p.connect()
  } catch (err) {
    console.warn(`[app-role] grant sweep skipped: ${errMessage(err)}`)
    return false
  }
  try {
    await client.query('BEGIN')
    for (const statement of APP_GRANT_STATEMENTS) await client.query(statement)
    await client.query('COMMIT')
    return true
  } catch (err) {
    await rollback(client)
    console.warn(`[app-role] grant sweep failed: ${errMessage(err)}`)
    return false
  } finally {
    client.release()
  }
}
