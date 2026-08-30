import { sql } from 'drizzle-orm'
import { tasks, taskSubtasks } from '@/lib/db/schema'

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

/**
 * SQL predicate for per-record privacy: a masked (is_private) task is visible
 * only to its owner. Tasks are a SHARED table, so this is the ONLY user-based
 * condition reads should carry — never a bare user_id filter (that would hide
 * teammates' shared tasks). Every endpoint that reads or mutates task rows
 * must AND this in; the RLS policy mirrors it but the default role has
 * BYPASSRLS, so the API predicate is the real boundary (docs/SECURITY.md).
 */
export function visibleTo(userId: string) {
  return sql`(${tasks.isPrivate} IS NOT TRUE OR ${tasks.userId} = ${userId})`
}

/**
 * Same privacy rule applied from the task_subtasks side: rows whose parent
 * task is masked by another user are invisible. For queries on taskSubtasks.
 */
export function parentTaskVisibleTo(userId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${tasks}
    WHERE ${tasks.id} = ${taskSubtasks.taskId}
      AND (${tasks.isPrivate} IS NOT TRUE OR ${tasks.userId} = ${userId})
  )`
}
