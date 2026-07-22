/**
 * tests/unit/modules-core/tasks/lib/task-query.test.ts
 *
 * Tests for modules-core/tasks/lib/task-query.ts — notDeleted().
 * We mock the heavy DB imports so this stays a pure unit test.
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
    deleted: { name: 'deleted', table: { _: { name: 'tasks' } } },
  },
}))

import { notDeleted } from '@/modules-core/tasks/lib/task-query'

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
