import { sql } from 'drizzle-orm'
import { tasks } from '@/lib/db/schema'

/**
 * SQL predicate that excludes soft-deleted tasks.
 *
 * `IS NOT TRUE` also matches legacy rows where `deleted` is NULL, treating them
 * as active. Every tasks query that should hide soft-deleted rows (list,
 * priorities/radar, stats, analytics) uses this single helper so the exclusion
 * can't silently be forgotten when a new endpoint is added — combine it with
 * other conditions via drizzle's `and(...)`.
 */
export function notDeleted() {
  return sql`${tasks.deleted} IS NOT TRUE`
}
