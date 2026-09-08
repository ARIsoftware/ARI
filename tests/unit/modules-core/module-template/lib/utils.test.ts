/**
 * Module Template — example unit tests
 *
 * Demonstrates ARI's testing convention: tests live centrally under
 * tests/unit/modules-core/<module-id>/, mirroring the module's source paths —
 * NEVER inside the module folder itself. Import the code under test via the
 * `@/modules/...` alias (resolves modules-custom first, then modules-core).
 *
 * Coverage note: every core module's lib/** is inside the ratcheted coverage
 * scope, so new logic needs matching tests or CI fails. module-template itself
 * is the one exception (excluded in vitest.config.ts as a scaffold) — these
 * tests exist as the reference for the convention.
 *
 * Run with: pnpm test
 */
import { describe, expect, it } from 'vitest'
import {
  filterEntries,
  formatEntryDate,
  getEntryStats,
  sortEntriesByDate,
  truncateMessage,
  validateMessage,
} from '@/modules/module-template/lib/utils'
import type { ModuleTemplateEntry } from '@/modules/module-template/types'

function entry(overrides: Partial<ModuleTemplateEntry> = {}): ModuleTemplateEntry {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    user_id: 'user-1',
    message: 'hello world',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('validateMessage', () => {
  it('rejects empty and whitespace-only messages', () => {
    expect(validateMessage('').valid).toBe(false)
    expect(validateMessage('   ').valid).toBe(false)
  })

  it('rejects messages over 500 characters', () => {
    const result = validateMessage('x'.repeat(501))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/500/)
  })

  it('accepts a normal message', () => {
    expect(validateMessage('hello')).toEqual({ valid: true })
  })
})

describe('formatEntryDate', () => {
  it('renders very recent timestamps as "Just now"', () => {
    expect(formatEntryDate(new Date().toISOString())).toBe('Just now')
  })

  it('renders minutes and hours ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatEntryDate(fiveMinAgo)).toBe('5 minutes ago')
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(formatEntryDate(twoHoursAgo)).toBe('2 hours ago')
  })
})

describe('sortEntriesByDate', () => {
  const older = entry({ id: 'a', created_at: '2026-01-01T00:00:00Z' })
  const newer = entry({ id: 'b', created_at: '2026-02-01T00:00:00Z' })

  it('sorts descending by default and does not mutate the input', () => {
    const input = [older, newer]
    const sorted = sortEntriesByDate(input)
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a'])
    expect(input.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('sorts ascending when asked', () => {
    expect(sortEntriesByDate([newer, older], 'asc').map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('filterEntries', () => {
  it('matches case-insensitively and passes everything through on a blank query', () => {
    const entries = [entry({ message: 'Alpha' }), entry({ message: 'beta' })]
    expect(filterEntries(entries, 'ALPHA')).toHaveLength(1)
    expect(filterEntries(entries, '  ')).toHaveLength(2)
  })
})

describe('getEntryStats', () => {
  it('handles the empty case without dividing by zero', () => {
    expect(getEntryStats([])).toEqual({
      total: 0,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      averageLength: 0,
    })
  })

  it('counts a fresh entry in every bucket', () => {
    const stats = getEntryStats([entry({ message: 'abcd' })])
    expect(stats.total).toBe(1)
    expect(stats.today).toBe(1)
    expect(stats.thisWeek).toBe(1)
    expect(stats.averageLength).toBe(4)
  })
})

describe('truncateMessage', () => {
  it('leaves short messages alone and truncates long ones with an ellipsis', () => {
    expect(truncateMessage('short', 10)).toBe('short')
    const truncated = truncateMessage('x'.repeat(20), 10)
    expect(truncated).toHaveLength(10)
    expect(truncated.endsWith('...')).toBe(true)
  })
})
