/**
 * The app pool — connections as the non-BYPASSRLS `ari_app` role, consumed
 * ONLY by withUserContext() (Phase 3 of DB-level RLS enforcement; see
 * docs/SECURITY.md). Everything else (Better Auth, bootstrap, backups, module
 * DDL, withAdminDb, activity log, telemetry) stays on the privileged pool.
 *
 * Shape: created lazily on first use from the password lib/db/app-role.ts
 * provisioned at boot, cached per process (and on globalThis in dev so HMR
 * does not leak pools, mirroring lib/db/pool.ts). Same tuning as the
 * privileged pool via createConfiguredPool().
 *
 * Degrade, never break — the state machine is CONNECTION-level only:
 *   - the role is disabled (kill switch) or unsupported (no CREATEROLE) →
 *     null, no probing; withUserContext runs on the privileged pool exactly
 *     as before this feature existed;
 *   - the role is not provisioned yet (setup incomplete, columns missing,
 *     provisioning failed) → null and a 60 s snooze before the next attempt;
 *   - a connect on the app pool fails → snooze 60 s, rate-limited warning,
 *     this call falls back; on 28P01 (bad password) / 28000 (role missing or
 *     rejected) the pool is dropped and ensureAppRole({ force: true }) repairs
 *     the role in the background, so a dropped role or an out-of-band password
 *     change heals within one snooze window without a restart.
 * Nothing about an OPERATION's outcome ever selects the privileged pool; see
 * withUserContext() for the one retry that exists (grant miss, same pool).
 *
 * Connection budget: this pool defaults to the privileged pool's size, so a
 * serverless instance now holds up to twice as many connections (3 + 3 in
 * production). DATABASE_APP_POOL_MAX tunes it independently.
 */
import type { Pool } from 'pg'
import { createConfiguredPool } from './pool'
import { buildAppPoolConfig } from './app-connection'
import { ensureAppRole, getAppRolePassword, getAppRoleStatus, isAppRoleDisabled } from './app-role'

declare global {
  var __ariPgAppPool: Pool | null | undefined
}

/** After a failure the app pool is not retried for this long; calls fall back meanwhile. */
export const APP_POOL_SNOOZE_MS = 60_000

export type AppPoolMode =
  'pending' | 'app' | 'fallback' | 'disabled' | 'unsupported' | 'unavailable'

export interface AppPoolState {
  /** What withUserContext() would use right now. */
  mode: AppPoolMode
  /** Epoch ms until which calls fall back to the privileged pool, when snoozed. */
  degradedUntil: number | null
  degradedReason: string | null
  /** withUserContext() calls that ran on the privileged pool while enforcement was expected. */
  fallbackCount: number
  /** 42501 "permission denied" grant sweeps + retries (steady state: 0). */
  grantMissRetries: number
}

// ── per-process state ──────────────────────────────────────────────────────

let appPool: Pool | null = globalThis.__ariPgAppPool ?? null
let creating: Promise<Pool | null> | null = null
let attempted = false
let degradedUntil = 0
let degradedReason: string | null = null
let fallbackCount = 0
let grantMissRetries = 0
let lastWarnAt = 0

/** Test seam: wipe the module-level state between cases. */
export function _resetAppPoolStateForTests(): void {
  appPool = null
  creating = null
  attempted = false
  degradedUntil = 0
  degradedReason = null
  fallbackCount = 0
  grantMissRetries = 0
  lastWarnAt = 0
  delete globalThis.__ariPgAppPool
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

/**
 * DATABASE_APP_POOL_MAX, else DATABASE_POOL_MAX, else the production/dev
 * default — with a NaN guard the privileged pool's parsing lacks: a
 * non-numeric or non-positive value falls through instead of yielding NaN.
 */
export function resolveAppPoolMax(env: Record<string, string | undefined> = process.env): number {
  for (const key of ['DATABASE_APP_POOL_MAX', 'DATABASE_POOL_MAX'] as const) {
    const raw = env[key]
    if (raw === undefined || raw.trim() === '') continue
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return env.NODE_ENV === 'production' ? 3 : 10
}

function snooze(reason: string): void {
  const now = Date.now()
  degradedUntil = now + APP_POOL_SNOOZE_MS
  degradedReason = reason
  if (now - lastWarnAt >= APP_POOL_SNOOZE_MS) {
    lastWarnAt = now
    console.warn(
      `[app-pool] running on the privileged role for the next ${APP_POOL_SNOOZE_MS / 1000}s: ${reason}`,
    )
  }
}

function clearSnooze(): void {
  degradedUntil = 0
  degradedReason = null
}

// ── pool lifecycle ─────────────────────────────────────────────────────────

async function createAppPool(): Promise<Pool | null> {
  attempted = true
  let status = getAppRoleStatus()
  // Boot normally provisions the role (instrumentation.ts). Scripts and tests
  // that never booted take the fast path here.
  if (status.state === 'pending') status = await ensureAppRole()
  if (status.state === 'unsupported' || status.state === 'disabled') return null

  const password = getAppRolePassword()
  const url = process.env.DATABASE_URL
  if (!password || !url) {
    // Transient: setup incomplete, columns missing, provisioning failed. Not
    // cached — retried after the snooze so a later bootstrap can still flip
    // this process onto the app pool.
    snooze(status.reason ?? 'app role not provisioned yet')
    return null
  }

  const p = createConfiguredPool(
    { ...buildAppPoolConfig(url, password), max: resolveAppPoolMax() },
    'App Pool',
  )
  appPool = p
  if (process.env.NODE_ENV !== 'production') globalThis.__ariPgAppPool = p
  clearSnooze()
  return p
}

/**
 * The app pool, created on first use. `null` means "use the privileged pool"
 * — permanently for disabled/unsupported installs, until the next attempt
 * otherwise. Never throws.
 */
export async function getAppPool(): Promise<Pool | null> {
  if (isAppRoleDisabled()) return null
  if (appPool) return appPool
  if (creating) return creating
  creating = createAppPool()
    .catch((err: unknown) => {
      snooze(`app pool could not be created: ${errMessage(err)}`)
      return null
    })
    .finally(() => {
      creating = null
    })
  return creating
}

/** getAppPool(), but `null` while snoozed after a recent failure. */
export async function getAppPoolIfHealthy(): Promise<Pool | null> {
  if (Date.now() < degradedUntil) return null
  return getAppPool()
}

/**
 * Record a failed connect on the app pool (called by withUserContext, which
 * then falls back for that one call). Credential failures also drop the pool
 * and repair the role in the background.
 */
export function noteAppPoolConnectFailure(err: unknown): void {
  const code = pgCode(err)
  snooze(`connect as the app role failed: ${errMessage(err)}`)
  fallbackCount++
  if (code === '28P01' || code === '28000') {
    resetAppPool()
    const failedAt = Date.now()
    void ensureAppRole({ force: true }).then((status) => {
      // Repaired (or verified) by a reconcile that ran AFTER this failure —
      // no need to sit out the rest of the snooze. A rate-limited force
      // returns the previous status (older checkedAt); keep the snooze then,
      // and the next attempt after it will force again.
      if (status.state === 'ready' && (status.checkedAt ?? 0) >= failedAt) clearSnooze()
    })
  }
}

/** A withUserContext() call ran on the privileged pool. Counted only when enforcement was expected. */
export function noteFallback(): void {
  if (isAppRoleDisabled()) return
  if (getAppRoleStatus().state === 'unsupported') return
  fallbackCount++
}

export function noteGrantMissRetry(): void {
  grantMissRetries++
}

/** Drop the current app pool (ended in the background); the next call builds a fresh one. */
export function resetAppPool(): void {
  const old = appPool
  appPool = null
  delete globalThis.__ariPgAppPool
  if (old) void old.end().catch(() => {})
}

/** Graceful shutdown counterpart of closePool(). */
export async function closeAppPool(): Promise<void> {
  const old = appPool
  appPool = null
  delete globalThis.__ariPgAppPool
  if (old) await old.end()
}

export function getAppPoolState(): AppPoolState {
  const now = Date.now()
  const snoozed = now < degradedUntil
  let mode: AppPoolMode
  if (isAppRoleDisabled()) mode = 'disabled'
  else if (getAppRoleStatus().state === 'unsupported') mode = 'unsupported'
  else if (snoozed) mode = 'fallback'
  else if (appPool) mode = 'app'
  else if (getAppRoleStatus().state === 'unavailable') mode = 'unavailable'
  else mode = attempted ? 'fallback' : 'pending'
  return {
    mode,
    degradedUntil: snoozed ? degradedUntil : null,
    degradedReason: snoozed ? degradedReason : null,
    fallbackCount,
    grantMissRetries,
  }
}
