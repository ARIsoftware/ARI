/**
 * Exact row counts for the backup verify route.
 *
 * Always COUNT(*) — never pg_class.reltuples. Estimates are stale by design
 * and report -1 on never-analyzed tables (PG14+), which the old code passed
 * straight through to the "preview what will be backed up" screen. At ARI's
 * personal scale (~40 tables) exact counts are trivially cheap, and a table
 * whose COUNT fails is reported as a failure instead of silently counted 0.
 */

import type { QueryFn } from './schema-discovery'

const SAFE_TABLE_NAME = /^[a-z_][a-z0-9_]*$/i

export interface RowCountResult {
  counts: Record<string, number>
  /** table → error message, for tables that could not be counted. */
  failures: Record<string, string>
}

export async function getExactRowCounts(query: QueryFn, tables: string[]): Promise<RowCountResult> {
  const counts: Record<string, number> = {}
  const failures: Record<string, string> = {}

  // Counts run concurrently — the pg pool queues excess queries, so this is
  // bounded by pool size while cutting the Preview action's wall-clock from
  // one round-trip per table to roughly one pool-batch.
  await Promise.all(
    tables.map(async (table) => {
      if (!SAFE_TABLE_NAME.test(table)) {
        failures[table] = 'invalid table name'
        return
      }
      try {
        const rows = await query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM "${table}"`)
        counts[table] = rows[0]?.cnt ?? 0
      } catch (error) {
        failures[table] = error instanceof Error ? error.message : String(error)
      }
    }),
  )

  return { counts, failures }
}
