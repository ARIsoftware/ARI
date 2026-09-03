/**
 * Retention for `api_key_usage_logs`.
 *
 * The table is append-only and driven by request rate, so without a bound it
 * grows forever. Backups exclude it (`EXCLUDED_TABLES` in
 * `lib/backup/constants.ts`), but unbounded growth still bloats the database
 * itself, so it needs its own retention.
 *
 * Cleanup is opportunistic rather than scheduled: a sampled fraction of writes
 * also prunes. That keeps the whole feature working identically on localhost
 * and on serverless, with no scheduler to own. Sampling scales naturally with
 * the thing being bounded — a busy key prunes often, a quiet key produces few
 * rows to begin with. The trade-off is that pruning lags the configured window
 * (a 30-day setting may not sweep until day ~35), which is acceptable here.
 */

import { and, eq, lt, sql } from 'drizzle-orm'
import { withAdminDb } from '@/lib/db'
import { activityLog, apiKeyUsageLogs, moduleSettings } from '@/lib/db/schema/core-schema'
import { API_LOGGING_MODULE_ID } from '@/lib/constants'

/** Retention windows offered in Settings → API. `null` means "never expire". */
export const RETENTION_DAY_OPTIONS = [30, 60, 90, 360] as const

/** Applied when a user has never chosen a retention window. */
export const DEFAULT_RETENTION_DAYS = 30

/**
 * Run the prune on 1 in N writes. At 200 the amortised cost is ~0.5% of
 * requests — one indexed, user-scoped DELETE. Tune here; nothing else depends
 * on the value.
 */
export const PRUNE_SAMPLE_RATE = 200

/**
 * Coerce a stored settings value into a retention window.
 *
 * Returns `null` for "never expire" and for anything unrecognised — an
 * unreadable setting must never cause deletion. Absent settings fall back to
 * the default so a fresh install is bounded without the user configuring
 * anything.
 */
export function resolveRetentionDays(settings: unknown): number | null {
  if (settings === null || settings === undefined) return DEFAULT_RETENTION_DAYS

  const raw = (settings as Record<string, unknown>).retentionDays

  // Explicit null is the "Never" choice — distinct from an absent key.
  if (raw === null) return null
  if (raw === undefined) return DEFAULT_RETENTION_DAYS

  const days = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(days) || days <= 0) return null

  return Math.floor(days)
}

/**
 * Read one user's configured retention window.
 *
 * When the user has never chosen, the answer depends on whether they have
 * pre-existing history. An install that upgraded into this feature may hold
 * months of `api_key_usage_logs`; applying the 30-day default to it would
 * destroy that audit history on the first sampled prune, before the user has
 * ever seen the Settings → API control. So existing history is grandfathered:
 * such users resolve to `null` ("never") until they actively pick a window.
 * Fresh installs, with nothing older than the default, still get 30 days and
 * stay bounded without configuration.
 *
 * The grandfather decision is made ONCE and persisted. Recomputing it on every
 * call is self-defeating: under the default policy the oldest surviving row is
 * always approaching the 30-day cutoff, and the history probe shares that same
 * cutoff — so the moment any row ages past it, an unconfigured user silently
 * flips to "never" and the table grows unbounded (the prune that would have
 * removed the row can never run first). Persisting pins fresh installs to the
 * bounded default and pins genuinely pre-existing history to "never", exactly
 * as the paragraph above intends.
 */
export async function getRetentionDays(userId: string): Promise<number | null> {
  const rows = await withAdminDb((db) =>
    db
      .select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(
        and(eq(moduleSettings.userId, userId), eq(moduleSettings.moduleId, API_LOGGING_MODULE_ID)),
      )
      .limit(1),
  )

  // An explicit choice always wins, including an explicit "never".
  if (rows.length > 0 && hasExplicitChoice(rows[0]?.settings)) {
    return resolveRetentionDays(rows[0]?.settings)
  }

  const days = (await hasHistoryOlderThanDefault(userId)) ? null : DEFAULT_RETENTION_DAYS
  try {
    await setRetentionDays(userId, days)
  } catch (err) {
    // Persisting is an optimisation of the next call — never let it break this
    // one (the settings read path also lands here).
    console.error('Failed to persist implicit retention choice:', err)
  }
  return days
}

/** Whether a stored settings blob carries a deliberate retentionDays value. */
function hasExplicitChoice(settings: unknown): boolean {
  if (settings === null || settings === undefined) return false
  return 'retentionDays' in (settings as Record<string, unknown>)
}

/**
 * Whether this user already has log rows older than the default window —
 * i.e. history that predates them ever seeing the retention control.
 *
 * Checks both governed tables: one setting covers request logs and the
 * activity trail, so pre-existing history in either is enough to grandfather.
 */
async function hasHistoryOlderThanDefault(userId: string): Promise<boolean> {
  const cutoff = defaultCutoff()

  const [usage, activity] = await Promise.all([
    withAdminDb((db) =>
      db
        .select({ id: apiKeyUsageLogs.id })
        .from(apiKeyUsageLogs)
        .where(and(eq(apiKeyUsageLogs.userId, userId), lt(apiKeyUsageLogs.createdAt, cutoff)))
        .limit(1),
    ),
    withAdminDb((db) =>
      db
        .select({ id: activityLog.id })
        .from(activityLog)
        .where(and(eq(activityLog.userId, userId), lt(activityLog.createdAt, cutoff)))
        .limit(1),
    ),
  ])

  return usage.length > 0 || activity.length > 0
}

/** ISO cutoff for the default window. */
function defaultCutoff(): string {
  return new Date(Date.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Delete one user's activity_log rows older than their retention window.
 *
 * Governed by the same setting as the request log. Rides the existing
 * (user_id, created_at DESC) index. Never throws.
 */
export async function pruneActivityLog(userId: string): Promise<number> {
  try {
    const days = await getRetentionDays(userId)
    if (days === null) return 0

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const result = await withAdminDb((db) =>
      db
        .delete(activityLog)
        .where(and(eq(activityLog.userId, userId), lt(activityLog.createdAt, cutoff))),
    )

    return result.rowCount ?? 0
  } catch (err) {
    console.error('Failed to prune activity log:', err)
    return 0
  }
}

/**
 * Whether this write should also prune. Separated from `pruneUsageLogs` so the
 * sampling decision is testable without stubbing global randomness.
 */
export function shouldPrune(sampleRate: number = PRUNE_SAMPLE_RATE): boolean {
  if (sampleRate <= 1) return true
  return Math.floor(Math.random() * sampleRate) === 0
}

/**
 * Delete one user's usage-log rows older than their retention window.
 *
 * Scoped to `userId` so it never touches another user's rows and can ride the
 * `(user_id, created_at)` index. Never throws — a retention failure must not
 * affect the request that triggered it.
 *
 * Returns the number of rows deleted, or 0 when retention is disabled.
 */
export async function pruneUsageLogs(userId: string): Promise<number> {
  try {
    const days = await getRetentionDays(userId)
    if (days === null) return 0

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // No .returning() — the first prune on a long-lived install can delete
    // hundreds of thousands of rows, and pulling every id back over the wire
    // just to count them is pure waste. rowCount comes from the command tag.
    const result = await withAdminDb((db) =>
      db
        .delete(apiKeyUsageLogs)
        .where(and(eq(apiKeyUsageLogs.userId, userId), lt(apiKeyUsageLogs.createdAt, cutoff))),
    )

    return result.rowCount ?? 0
  } catch (err) {
    console.error('Failed to prune API key usage logs:', err)
    return 0
  }
}

/** Persist a user's retention choice. `null` disables expiry. */
export async function setRetentionDays(userId: string, days: number | null): Promise<void> {
  await withAdminDb((db) =>
    db
      .insert(moduleSettings)
      .values({
        userId,
        moduleId: API_LOGGING_MODULE_ID,
        enabled: true,
        settings: { retentionDays: days },
      })
      .onConflictDoUpdate({
        target: [moduleSettings.userId, moduleSettings.moduleId],
        set: { settings: { retentionDays: days }, updatedAt: sql`NOW()` },
      }),
  )
}
