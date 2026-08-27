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
import { pool } from '@/lib/db/pool'
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
 * Whether the pooled connection role bypasses RLS (superuser or the explicit
 * BYPASSRLS attribute). Returns null if it can't be determined. When true,
 * RLS policies are not enforced and the tenant boundary is the application
 * layer — the documented ARI default.
 */
export async function connectionBypassesRls(): Promise<boolean | null> {
  if (!pool) return null
  try {
    const { rows } = await pool.query<{ bypass: boolean }>(
      `SELECT (rolsuper OR rolbypassrls) AS bypass
         FROM pg_roles WHERE rolname = current_user`
    )
    return rows[0]?.bypass ?? null
  } catch {
    return null
  }
}

export interface RlsTestPayload {
  authenticated: true
  userId: string
  success: boolean
  bypassRls: boolean | null
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

    // ARI's documented default (docs/SECURITY.md) connects as a Postgres
    // superuser, which has BYPASSRLS — so the negative test intentionally
    // "leaks" the row and isolation is enforced at the application layer. Only
    // when the role does NOT bypass RLS is a failed negative test a real problem.
    const bypassRls = await connectionBypassesRls()

    const allPass = positivePass && (negativePass || bypassRls === true)

    return {
      authenticated: true,
      userId,
      success: allPass,
      bypassRls,
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
      note: bypassRls
        ? 'Connection role bypasses RLS (documented default) — user isolation is enforced at the application layer; RLS is defense-in-depth only'
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
