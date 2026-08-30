/**
 * tests/unit/modules-core/tasks/lib/task-query.test.ts
 *
 * Tests for modules-core/tasks/lib/task-query.ts — notDeleted(), visibleTo(),
 * parentTaskVisibleTo(). We mock the heavy DB imports so this stays a pure
 * unit test.
 */
import { describe, it, expect, vi } from 'vitest'

// ── mock drizzle-orm/sql ───────────────────────────────────────────────────────
// sql is a template-tag function; return a recognisable object.
vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __type: 'sql',
      strings: Array.from(strings),
      values,
    }),
    { raw: (s: string) => ({ __type: 'sql-raw', s }) }
  ),
}))

// ── mock @/lib/db/schema ───────────────────────────────────────────────────────
vi.mock('@/lib/db/schema', () => ({
  tasks: {
    id: { name: 'id', table: { _: { name: 'tasks' } } },
    deleted: { name: 'deleted', table: { _: { name: 'tasks' } } },
    isPrivate: { name: 'is_private', table: { _: { name: 'tasks' } } },
    userId: { name: 'user_id', table: { _: { name: 'tasks' } } },
  },
  taskSubtasks: {
    taskId: { name: 'task_id', table: { _: { name: 'task_subtasks' } } },
  },
}))

import { notDeleted, visibleTo, parentTaskVisibleTo } from '@/modules-core/tasks/lib/task-query'

describe('notDeleted()', () => {
  it('returns a truthy value', () => {
    expect(notDeleted()).toBeTruthy()
  })

  it('returns an object (SQL fragment — not null/undefined/primitive)', () => {
    const result = notDeleted()
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('is safe to call multiple times (idempotent, no side effects)', () => {
    const a = notDeleted()
    const b = notDeleted()
    // Both calls should return equivalent structures
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('visibleTo()', () => {
  it('returns a SQL fragment object', () => {
    const result = visibleTo('user-1') as { __type?: string }
    expect(result).toBeTruthy()
    expect(result.__type).toBe('sql')
  })

  it('binds the caller user id as a parameter (never interpolated)', () => {
    const result = visibleTo('user-1') as unknown as { values: unknown[] }
    expect(result.values).toContain('user-1')
  })

  it('references is_private and user_id columns', () => {
    const result = visibleTo('user-1') as unknown as { values: Array<{ name?: string }> }
    const columnNames = result.values.map((v) => v?.name).filter(Boolean)
    expect(columnNames).toContain('is_private')
    expect(columnNames).toContain('user_id')
  })
})

describe('parentTaskVisibleTo()', () => {
  it('returns a SQL fragment binding the user id', () => {
    const result = parentTaskVisibleTo('user-2') as unknown as { __type: string; values: unknown[] }
    expect(result.__type).toBe('sql')
    expect(result.values).toContain('user-2')
  })

  it('correlates task_subtasks.task_id against tasks privacy columns', () => {
    const result = parentTaskVisibleTo('user-2') as unknown as { values: Array<{ name?: string }> }
    const columnNames = result.values.map((v) => v?.name).filter(Boolean)
    expect(columnNames).toContain('task_id')
    expect(columnNames).toContain('is_private')
    expect(columnNames).toContain('user_id')
  })
})
