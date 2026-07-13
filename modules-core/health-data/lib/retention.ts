/**
 * Retention enforcement for the Health Data module.
 *
 * Parsed health data lives for at most one hour. Every API route calls
 * purgeExpiredImports() before touching data, so expired imports (and all
 * child rows, via ON DELETE CASCADE) are removed the moment anything
 * touches the module after expiry. All reads additionally filter on
 * expires_at > now() so an expired-but-not-yet-purged row is never served.
 */

import { and, eq, lt, gt, desc, sql } from 'drizzle-orm'
import { healthDataImports } from '@/lib/db/schema'
import { withAdminDb, type DrizzleDb } from '@/lib/db'

export const RETENTION_MS = 60 * 60 * 1000

/** How often the background sweeper checks for expired imports */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

const SWEEPER_KEY = Symbol.for('ari.health-data.purge-sweeper')

/**
 * Start a process-wide interval that deletes expired imports for ALL
 * users, so the 1-hour deletion promise holds even when nobody revisits
 * the module. Idempotent (survives HMR via a global symbol); begins with
 * the first module request after boot and runs for the server lifetime.
 */
export function ensurePurgeSweeper(): void {
  const globals = globalThis as Record<symbol, unknown>
  if (globals[SWEEPER_KEY]) return

  const sweep = async () => {
    try {
      await withAdminDb((db) =>
        db.delete(healthDataImports).where(lt(healthDataImports.expiresAt, new Date().toISOString()))
      )
    } catch (err) {
      console.error('[health-data] Purge sweep failed:', err)
    }
  }

  const interval = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Don't keep the process alive just for the sweeper
  interval.unref?.()
  globals[SWEEPER_KEY] = interval
  void sweep()
}

/** A processing import with no progress update for this long is considered dead */
export const STALE_PROCESSING_MS = 5 * 60 * 1000

export type WithRLS = <T>(operation: (db: DrizzleDb) => Promise<T>) => Promise<T>

export async function purgeExpiredImports(withRLS: WithRLS, userId: string): Promise<void> {
  ensurePurgeSweeper()
  await withRLS((db) =>
    db
      .delete(healthDataImports)
      .where(and(eq(healthDataImports.userId, userId), lt(healthDataImports.expiresAt, new Date().toISOString())))
  )
}

/**
 * Purge expired data, mark abandoned processing imports as failed, and
 * return the user's current (unexpired) import row, if any.
 */
export async function getCurrentImport(withRLS: WithRLS, userId: string) {
  await purgeExpiredImports(withRLS, userId)

  const rows = await withRLS((db) =>
    db
      .select()
      .from(healthDataImports)
      .where(and(eq(healthDataImports.userId, userId), gt(healthDataImports.expiresAt, new Date().toISOString())))
      .orderBy(desc(healthDataImports.createdAt))
      .limit(1)
  )
  const row = rows[0]
  if (!row) return null

  if (row.status === 'processing' && Date.now() - new Date(row.updatedAt).getTime() > STALE_PROCESSING_MS) {
    const updated = await withRLS((db) =>
      db
        .update(healthDataImports)
        .set({
          status: 'failed',
          error: 'The import was interrupted (for example by a server restart). Please upload the file again.',
          updatedAt: sql`now()`,
        })
        .where(and(eq(healthDataImports.id, row.id), eq(healthDataImports.userId, userId)))
        .returning()
    )
    return updated[0] ?? null
  }

  return row
}

/**
 * The user's completed, unexpired import — the gate every data route uses.
 */
export async function getCompletedImport(withRLS: WithRLS, userId: string) {
  const row = await getCurrentImport(withRLS, userId)
  if (!row || row.status !== 'completed') return null
  return row
}
