/**
 * Health-check implementations.
 *
 * Each exported `check*` function returns the exact payload its corresponding
 * `/api/health/*` route responds with, so the routes stay thin and the
 * aggregate `/api/health/full` endpoint can never drift from them.
 *
 * These functions deliberately do NOT authenticate — callers are responsible
 * for that (routes via `getAuthenticatedUser()`). That keeps them reusable
 * from a non-HTTP context, e.g. a scheduled scan.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import type { Pool } from 'pg'
import { pool } from '@/lib/db/pool'
import { getAppPool, getAppPoolIfHealthy, getAppPoolState, type AppPoolMode } from '@/lib/db/app-pool'
import { getAppRoleStatus } from '@/lib/db/app-role'
import { APP_ROLE_NAME } from '@/lib/db/app-connection'
import { MODULE_SCHEMAS } from '@/lib/generated/module-schemas'
import { withUserContext, type DrizzleDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { getModules } from '@/lib/modules/module-registry'
import { AI_PROVIDERS } from '@/lib/ai-providers'
import { INTEGRATIONS_MODULE_ID } from '@/lib/constants'
import {
  readStorageConfig,
  getDefaultLocalStorageBasePath,
  isStorageUnavailable,
} from '@/lib/storage'
import { safeErrorResponse } from '@/lib/api-error'

/** The RLS-scoped query runner handed out by `getAuthenticatedUser()`. */
export type WithRLS = <T>(operation: (db: DrizzleDb) => Promise<T>) => Promise<T>

// ── Database ────────────────────────────────────────────────────────────────

export interface DatabasePayload {
  status: 'ok' | 'error'
  checks: Record<string, { status: 'ok' | 'error'; message?: string }>
}

/** Connectivity probe: acquires a pooled connection and runs `SELECT 1`. */
export async function checkDatabase(): Promise<DatabasePayload> {
  const checks: DatabasePayload['checks'] = {}

  try {
    if (!pool) {
      checks.database = { status: 'error', message: 'DATABASE_URL not configured' }
    } else {
      const client = await pool.connect()
      try {
        await client.query('SELECT 1')
        checks.database = { status: 'ok' }
      } finally {
        client.release()
      }
    }
  } catch (err) {
    checks.database = { status: 'error', message: safeErrorResponse(err) }
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok')
  return { status: allOk ? 'ok' : 'error', checks }
}

// ── Auth configuration ──────────────────────────────────────────────────────

export interface AuthConfigPayload {
  isProduction: boolean
  secretConfigured: boolean
  databaseConfigured: boolean
  sslEnabled: boolean
  hasProductionOrigin: boolean
  rateLimitEnabled: boolean
  trustedOriginsCount: number
  environment: Record<string, string | undefined>
}

/**
 * Non-sensitive Better Auth configuration status. Never returns secrets —
 * only whether each one is present and plausibly valid.
 */
export function checkAuthConfig(): AuthConfigPayload {
  const isProduction = process.env.NODE_ENV === 'production'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  // Presence + minimum-length check; the value itself is never exposed.
  const secretConfigured = !!(
    process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32
  )
  const databaseConfigured = !!process.env.DATABASE_URL
  const sslEnabled = isProduction
  const hasProductionOrigin = !!appUrl && !appUrl.includes('localhost')
  const rateLimitEnabled = true

  const trustedOrigins: string[] = []
  if (appUrl) trustedOrigins.push(appUrl)
  if (!isProduction) trustedOrigins.push('http://localhost:3000', 'http://localhost:3001')

  return {
    isProduction,
    secretConfigured,
    databaseConfigured,
    sslEnabled,
    hasProductionOrigin,
    rateLimitEnabled,
    trustedOriginsCount: trustedOrigins.length,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_URL: appUrl ? 'Set' : 'Not set',
      DATABASE_URL: databaseConfigured ? 'Set' : 'Not set',
      BETTER_AUTH_SECRET: secretConfigured ? 'Set (32+ chars)' : 'Missing or too short',
    },
  }
}

// ── AI providers ────────────────────────────────────────────────────────────

export interface AiProvidersPayload {
  status: 'ok' | 'none'
  configuredCount: number
  providers: Array<{
    id: string
    name: string
    configured: boolean
    source: 'env' | 'db' | null
  }>
}

/**
 * Per-provider key configuration. An env var takes precedence over a
 * DB-saved value. Never returns the keys themselves.
 */
export async function checkAiProviders(withRLS: WithRLS): Promise<AiProvidersPayload> {
  const rows = await withRLS((db) =>
    db
      .select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID))
      .limit(1)
  )
  const saved = (rows[0]?.settings ?? {}) as Record<string, unknown>

  const providers = AI_PROVIDERS.map((p) => {
    const envVal = process.env[p.primaryEnvKey]
    const savedVal = saved[p.primaryEnvKey]
    const source: 'env' | 'db' | null =
      envVal && envVal.length > 0
        ? 'env'
        : typeof savedVal === 'string' && savedVal.length > 0
          ? 'db'
          : null
    return { id: p.id, name: p.name, configured: source !== null, source }
  })

  const configuredCount = providers.filter((p) => p.configured).length
  return { status: configuredCount > 0 ? 'ok' : 'none', configuredCount, providers }
}

// ── Module status ───────────────────────────────────────────────────────────

/** The subset of a module_settings row this check reads. */
type ModuleSettingRow = { moduleId?: string; module_id?: string; enabled?: boolean | null }

export interface ModuleStatusPayload {
  authenticated: true
  userId: string
  allModules: Array<{ id: string; enabled?: boolean }>
  userSettings: unknown[]
  moduleChecks: Record<string, { exists: true; enabled: boolean }>
}

/**
 * Module discovery + per-user enable state. A module counts as enabled iff its
 * manifest enables it AND the user hasn't explicitly disabled it.
 */
export async function checkModuleStatus(
  userId: string,
  withRLS: WithRLS
): Promise<ModuleStatusPayload> {
  const allModules = await getModules()

  const settings = await withRLS((db) =>
    db.select().from(moduleSettings).where(eq(moduleSettings.userId, userId))
  )

  const userDisabled = new Set(
    (settings as ModuleSettingRow[])
      .filter((s) => s.enabled === false)
      .map((s) => s.moduleId ?? s.module_id)
      .filter(Boolean)
  )

  const moduleChecks: ModuleStatusPayload['moduleChecks'] = {}
  for (const m of allModules) {
    moduleChecks[m.id] = {
      exists: true,
      enabled: m.enabled !== false && !userDisabled.has(m.id),
    }
  }

  return {
    authenticated: true,
    userId,
    allModules: allModules.map((m) => ({ id: m.id, enabled: m.enabled })),
    userSettings: settings,
    moduleChecks,
  }
}

// ── Multi-user setup ────────────────────────────────────────────────────────

const REQUIRED_COLUMNS = ['role', 'permissions', 'disabled'] as const

export interface MultiUserPayload {
  ok: boolean
  columnsPresent: boolean
  missingColumns: string[]
  sharedAccessFunction: boolean
  activeAdminCount: number | null
  hasActiveAdmin: boolean
}

/**
 * Verifies the app-layer invariants multi-user depends on: the role /
 * permissions / disabled columns exist, `app.can_access_shared()` is present,
 * and at least one active admin remains.
 *
 * Returns `null` when no pool is configured, which callers map to a 500 —
 * this is distinct from "the checks ran and failed".
 */
export async function checkMultiUser(): Promise<MultiUserPayload | null> {
  if (!pool) return null

  const { rows: colRows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user'
         AND column_name = ANY($1::text[])`,
    [[...REQUIRED_COLUMNS]]
  )
  const present = new Set(colRows.map((r) => r.column_name))
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !present.has(c))
  const columnsPresent = missingColumns.length === 0

  // The shared-workspace RLS policies call this function, so its absence means
  // the shared-workspace DDL didn't fully apply (e.g. a restored old backup).
  const { rows: fnRows } = await pool.query<{ present: boolean }>(
    `SELECT to_regprocedure('app.can_access_shared()') IS NOT NULL AS present`
  )
  const sharedAccessFunction = fnRows[0]?.present === true

  // Only meaningful once the columns exist.
  let activeAdminCount: number | null = null
  if (present.has('role') && present.has('disabled')) {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM "user" WHERE "role" = 'admin' AND "disabled" = FALSE`
    )
    activeAdminCount = Number(rows[0]?.count ?? 0)
  }
  const hasActiveAdmin = (activeAdminCount ?? 0) > 0

  return {
    ok: columnsPresent && sharedAccessFunction && hasActiveAdmin,
    columnsPresent,
    missingColumns: [...missingColumns],
    sharedAccessFunction,
    activeAdminCount,
    hasActiveAdmin,
  }
}

// ── Filesystem storage ──────────────────────────────────────────────────────

export interface StorageFilesystemPayload {
  provider: string
  applicable: boolean
  basePath?: string
  exists?: boolean
  writable?: boolean
  isEphemeral?: boolean
  error?: string
}

/**
 * Pre-flight for the local filesystem storage provider. Returns
 * `applicable: false` for every other provider.
 */
export async function checkStorageFilesystem(): Promise<StorageFilesystemPayload> {
  const config = readStorageConfig()
  if (config.provider !== 'filesystem') {
    return { provider: config.provider, applicable: false }
  }

  const basePath = getDefaultLocalStorageBasePath()
  const isEphemeral = isStorageUnavailable(config)

  let exists = false
  let writable = false
  let error: string | undefined

  try {
    await fs.mkdir(basePath, { recursive: true })
    exists = true
    // Prove writability by actually writing — fs.access(W_OK) is TOCTOU and
    // misses quota/noexec/parent-perm-changed-after-mkdir cases.
    const probe = path.join(basePath, `.ari-health-write-probe-${process.pid}-${Date.now()}`)
    await fs.writeFile(probe, '')
    await fs.unlink(probe)
    writable = true
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException
    error = e.code ? `${e.code}: ${e.message}` : (e.message ?? String(err))
  }

  return {
    provider: 'filesystem',
    applicable: true,
    basePath,
    exists,
    writable,
    isEphemeral,
    ...(error ? { error } : {}),
  }
}

// ── RLS isolation ───────────────────────────────────────────────────────────

/**
 * Sentinel module_id used exclusively by this diagnostic. Chosen to be
 * visually obvious and unlikely to collide with any real module id.
 */
const SENTINEL_MODULE_ID = '__debug_rls_test__'

/**
 * Whether a pool's connection role bypasses RLS (superuser or the explicit
 * BYPASSRLS attribute). Returns null if it can't be determined. Defaults to
 * the privileged pool (whose role normally DOES bypass — that is why the
 * request path runs on the app pool instead); pass the app pool to verify the
 * enforcing role really cannot bypass.
 */
export async function connectionBypassesRls(p: Pool | null = pool): Promise<boolean | null> {
  if (!p) return null
  try {
    const { rows } = await p.query<{ bypass: boolean }>(
      `SELECT (rolsuper OR rolbypassrls) AS bypass
         FROM pg_roles WHERE rolname = current_user`
    )
    return rows[0]?.bypass ?? null
  } catch {
    return null
  }
}

// ── App role: DB-level RLS enforcement status ───────────────────────────────

export type AppRoleHealthStatus = 'active' | 'fallback' | 'disabled' | 'unsupported' | 'unavailable'

export interface AppRoleTransition {
  type: 'fallback' | 'restored'
  at: number
  reason: string | null
}

export interface AppRolePayload {
  /** What request-path queries are using right now. */
  status: AppRoleHealthStatus
  roleName: string
  /** True only when request-path queries run as the app role AND that role cannot bypass RLS. */
  enforced: boolean
  /** BYPASSRLS/superuser probe on the app pool itself; null when it could not be probed. */
  appRoleBypassRls: boolean | null
  /** Why enforcement is not active (fallback reason, kill switch, no CREATEROLE, …). */
  reason: string | null
  /** No-FORCE compensating check: the app role must own no tables, or RLS would not apply to it. */
  ownsNoTables: boolean | null
  /** withUserContext() calls that ran on the privileged pool while enforcement was expected. */
  fallbackCount: number
  /** 42501 "permission denied" grant sweeps + retries — anything but 0 in steady state is worth a look. */
  grantMissRetries: number
  rotatedAt: string | null
  lastTransition: AppRoleTransition | null
}

function appRoleStatusFromMode(mode: AppPoolMode): AppRoleHealthStatus {
  switch (mode) {
    case 'app':
      return 'active'
    case 'disabled':
      return 'disabled'
    case 'unsupported':
      return 'unsupported'
    case 'unavailable':
      return 'unavailable'
    default:
      return 'fallback'
  }
}

/**
 * The truth about DB-level RLS enforcement in this process: which pool the
 * request path uses, whether the app role really cannot bypass RLS, and the
 * counters that reveal silent degradation.
 */
export async function checkAppRole(): Promise<AppRolePayload> {
  // A never-attempted pool would report "pending"; resolve it so the report
  // reflects what the next request will actually do.
  if (getAppPoolState().mode === 'pending') await getAppPool()
  const poolState = getAppPoolState()
  const role = getAppRoleStatus()
  const status = appRoleStatusFromMode(poolState.mode)

  const appPool = status === 'active' ? await getAppPoolIfHealthy() : null
  const appRoleBypassRls = appPool ? await connectionBypassesRls(appPool) : null

  let ownsNoTables: boolean | null = null
  if (pool) {
    try {
      const { rows } = await pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_tables WHERE tableowner = $1',
        [APP_ROLE_NAME]
      )
      ownsNoTables = (rows[0]?.n ?? 0) === 0
    } catch {
      ownsNoTables = null
    }
  }

  return {
    status,
    roleName: APP_ROLE_NAME,
    enforced: status === 'active' && appRoleBypassRls === false,
    appRoleBypassRls,
    reason: poolState.degradedReason ?? role.reason ?? null,
    ownsNoTables,
    fallbackCount: poolState.fallbackCount,
    grantMissRetries: poolState.grantMissRetries,
    rotatedAt: role.rotatedAt,
    lastTransition: poolState.lastTransition,
  }
}

/** One sentence that is true for every enforcement state — shown on the /health RLS tab. */
export function rlsEnforcementNote(appRole: AppRolePayload, privilegedBypassRls: boolean | null): string {
  if (appRole.enforced) {
    return `RLS is enforced — request-path queries run as ${appRole.roleName}, which cannot bypass row security, so Postgres evaluates the policies below on every query`
  }
  if (privilegedBypassRls === false) {
    return 'Connection role does not bypass RLS — the policies below are actively enforced at the database level'
  }
  switch (appRole.status) {
    case 'active':
      return appRole.appRoleBypassRls === true
        ? `RLS is NOT enforced — ${appRole.roleName} has BYPASSRLS or superuser; revoke it (ALTER ROLE ${appRole.roleName} NOBYPASSRLS NOSUPERUSER) or enforcement is meaningless`
        : `Request-path queries run as ${appRole.roleName}, but its RLS bypass could not be confirmed off — check pg_roles`
    case 'disabled':
      return 'RLS enforcement is switched off by ARI_DISABLE_RLS_ENFORCEMENT — request-path queries run on the privileged role and the policies below are defense-in-depth only; unset the variable and restart to re-enable'
    case 'unsupported':
      return `RLS enforcement is unavailable on this database — the DATABASE_URL role cannot create the ${appRole.roleName} role (needs CREATEROLE); the policies below are defense-in-depth only`
    default:
      return `RLS enforcement is in fallback — request-path queries run on the privileged role until the ${appRole.roleName} role recovers; the policies below are defense-in-depth meanwhile${appRole.reason ? ` (${appRole.reason})` : ''}`
  }
}

export interface RlsTestPayload {
  authenticated: true
  userId: string
  success: boolean
  /** Whether the PRIVILEGED pool's role bypasses RLS (kept for older clients). */
  bypassRls: boolean | null
  /** Which pool actually served the test queries. */
  servedBy: 'app-role' | 'privileged'
  /** True when the test ran as the app role — the negative test is then real, never excused. */
  enforced: boolean
  mode: AppPoolMode
  positiveTest: {
    description: string
    rowCount: number
    allOwnedByCurrentUser: boolean
    passed: boolean
  }
  negativeTest: {
    description: string
    fakeUserContext: string
    rowCount: number
    passed: boolean
  }
  tableTested: string
  note: string
}

/**
 * End-to-end RLS isolation test against `module_settings`, using a temporary
 * sentinel row that is always cleaned up. Works on a fresh install with no
 * existing data.
 *
 * Mutates the database (INSERT/DELETE), which is why the route exposing it is
 * a POST rather than a GET.
 */
export async function runRlsTest(userId: string, withRLS: WithRLS): Promise<RlsTestPayload> {
  // Per-request fake user id for the negative test. Cryptographically random
  // so it cannot collide with a real Better Auth user id or leak across runs.
  const fakeUserId = `__debug_rls_fake_user_${randomBytes(16).toString('hex')}__`
  // Which pool serves the queries below: the app pool unless it is snoozed,
  // disabled or unsupported — detected by the fallback counter not moving.
  const stateBefore = getAppPoolState()

  // Clear any leftover sentinel from a previously aborted run — otherwise the
  // unique (user_id, module_id) constraint fires.
  await withRLS((db) =>
    db
      .delete(moduleSettings)
      .where(
        and(eq(moduleSettings.userId, userId), eq(moduleSettings.moduleId, SENTINEL_MODULE_ID))
      )
  )

  let insertedRowId: string | null = null
  try {
    // Step 1: INSERT via the current user's RLS context. The WITH CHECK clause
    // rejects this if user_id doesn't match app.current_user_id — so success
    // proves the context was set.
    const inserted = await withRLS((db) =>
      db
        .insert(moduleSettings)
        .values({
          userId,
          moduleId: SENTINEL_MODULE_ID,
          enabled: false,
          settings: { debugRlsTest: true },
        })
        .returning({ id: moduleSettings.id })
    )
    insertedRowId = inserted[0]?.id ?? null

    // Step 2 (positive): current user SELECT should return the sentinel.
    const positiveRows = await withRLS((db) =>
      db.select().from(moduleSettings).where(eq(moduleSettings.moduleId, SENTINEL_MODULE_ID))
    )
    const positivePass = positiveRows.length === 1 && positiveRows[0].userId === userId

    // Step 3 (negative): a different user's context must see 0 sentinel rows.
    // If RLS were misconfigured (or bypassed) this would leak our row.
    const negativeRows = await withUserContext(fakeUserId, (db) =>
      db.select().from(moduleSettings).where(eq(moduleSettings.moduleId, SENTINEL_MODULE_ID))
    )
    const negativePass = negativeRows.length === 0

    const stateAfter = getAppPoolState()
    const servedBy: RlsTestPayload['servedBy'] =
      stateAfter.mode === 'app' && stateAfter.fallbackCount === stateBefore.fallbackCount
        ? 'app-role'
        : 'privileged'
    const enforced = servedBy === 'app-role'

    // On the app role the negative test is real: a leak is a leak. On the
    // privileged role (fallback, kill switch, unsupported install) that role
    // normally has BYPASSRLS, so the row intentionally "leaks" and isolation is
    // enforced at the application layer — excused, and reported as such.
    const bypassRls = await connectionBypassesRls()

    const allPass = positivePass && (negativePass || (!enforced && bypassRls === true))

    return {
      authenticated: true,
      userId,
      success: allPass,
      bypassRls,
      servedBy,
      enforced,
      mode: stateAfter.mode,
      positiveTest: {
        description: 'Current user can see their own inserted row',
        rowCount: positiveRows.length,
        allOwnedByCurrentUser:
          positiveRows.length > 0 && positiveRows.every((r) => r.userId === userId),
        passed: positivePass,
      },
      negativeTest: {
        description: "A different user context sees 0 of this user's rows",
        fakeUserContext: fakeUserId,
        rowCount: negativeRows.length,
        passed: negativePass,
      },
      tableTested: 'module_settings',
      note: enforced
        ? `End-to-end RLS check ran as ${APP_ROLE_NAME}: Postgres itself hid the sentinel row from the other user context — works on fresh installs with no real data`
        : bypassRls
          ? `Ran on the privileged role (${stateAfter.mode === 'disabled' ? 'kill switch' : stateAfter.mode === 'unsupported' ? 'app role unsupported here' : 'app pool in fallback'}), which bypasses RLS — the negative test is excused; user isolation is enforced at the application layer until the app role is active`
          : 'End-to-end RLS check using a sentinel row — works on fresh installs with no real data',
    }
  } finally {
    // Always clean up the sentinel row, even if an assertion failed above.
    if (insertedRowId) {
      try {
        await withRLS((db) => db.delete(moduleSettings).where(eq(moduleSettings.id, insertedRowId!)))
      } catch (cleanupError) {
        console.error('[Debug RLS] Failed to clean up sentinel row:', cleanupError)
      }
    }
  }
}

// ── Per-table RLS coverage ──────────────────────────────────────────────────

/**
 * Better Auth system tables. They are intentionally queried on the privileged
 * connection before any user context exists (sign-in must read `user` by
 * email), so absent RLS is by design rather than a coverage gap.
 */
const AUTH_SYSTEM_TABLES = new Set(['user', 'session', 'account', 'twoFactor', 'verification'])

export type RlsTableStatus = 'ok' | 'no_policies' | 'disabled' | 'system'

export interface RlsTableRow {
  table: string
  /** Owning module id, or 'core' for setup.sql / unattributed tables. */
  module: string
  rlsEnabled: boolean
  rlsForced: boolean
  policyCount: number
  status: RlsTableStatus
}

export interface RlsTablesPayload {
  /** Whether the PRIVILEGED pool's role bypasses RLS. */
  bypassRls: boolean | null
  /** True when request-path queries are RLS-enforced: the app role is active and cannot bypass, or the privileged role itself cannot. */
  enforced: boolean
  appRole: AppRolePayload
  tables: RlsTableRow[]
  summary: { total: number; ok: number; noPolicies: number; disabled: number; system: number }
  note: string
}

/**
 * Maps table name → owning module id by scanning each module's inlined
 * schema.sql for CREATE TABLE statements. Tables not claimed by any module
 * fall back to 'core' (setup.sql or hand-created).
 */
export function buildTableModuleMap(schemas: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [moduleId, sql] of Object.entries(schemas)) {
    for (const match of sql.matchAll(
      /CREATE TABLE IF NOT EXISTS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi
    )) {
      // First claimant wins — modules-custom overrides shadow core copies of
      // the same table name, but both declare identical CREATE statements.
      if (!map.has(match[1])) map.set(match[1], moduleId)
    }
  }
  return map
}

/**
 * Per-table RLS audit over every ordinary table in `public`: is RLS enabled,
 * is it FORCEd (applies to the table owner too), and how many policies exist.
 *
 * Two states matter more than "disabled": a table with RLS enabled but zero
 * policies becomes deny-all the moment ARI stops connecting as a BYPASSRLS
 * role, and a table with RLS off becomes readable by every authenticated user.
 * This check is the pre-flight audit for DB-level RLS enforcement.
 *
 * Returns `null` when no pool is configured.
 */
export async function checkRlsTables(): Promise<RlsTablesPayload | null> {
  if (!pool) return null

  const { rows } = await pool.query<{
    table_name: string
    rls_enabled: boolean
    rls_forced: boolean
    policy_count: number
  }>(
    `SELECT c.relname AS table_name,
            c.relrowsecurity AS rls_enabled,
            c.relforcerowsecurity AS rls_forced,
            count(p.polname)::int AS policy_count
       FROM pg_class c
       LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE c.relkind = 'r'
        AND c.relnamespace = 'public'::regnamespace
      GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
      ORDER BY c.relname`
  )

  const moduleByTable = buildTableModuleMap(MODULE_SCHEMAS)
  const bypassRls = await connectionBypassesRls()
  const appRole = await checkAppRole()

  const tables: RlsTableRow[] = rows.map((r) => {
    const status: RlsTableStatus = AUTH_SYSTEM_TABLES.has(r.table_name)
      ? 'system'
      : !r.rls_enabled
        ? 'disabled'
        : r.policy_count === 0
          ? 'no_policies'
          : 'ok'
    return {
      table: r.table_name,
      module: moduleByTable.get(r.table_name) ?? 'core',
      rlsEnabled: r.rls_enabled,
      rlsForced: r.rls_forced,
      policyCount: r.policy_count,
      status,
    }
  })

  const summary = {
    total: tables.length,
    ok: tables.filter((t) => t.status === 'ok').length,
    noPolicies: tables.filter((t) => t.status === 'no_policies').length,
    disabled: tables.filter((t) => t.status === 'disabled').length,
    system: tables.filter((t) => t.status === 'system').length,
  }

  return {
    bypassRls,
    enforced: appRole.enforced || bypassRls === false,
    appRole,
    tables,
    summary,
    note: rlsEnforcementNote(appRole, bypassRls),
  }
}
