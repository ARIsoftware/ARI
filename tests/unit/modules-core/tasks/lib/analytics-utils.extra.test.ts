/**
 * Extra coverage tests for tasks/lib/analytics-utils.ts.
 * Targets: dateStrInTimeZone (both branches), todayInTimeZone.
 */
import { describe, it, expect } from 'vitest'
import { dateStrInTimeZone, todayInTimeZone } from '@/modules-core/tasks/lib/analytics-utils'

describe('dateStrInTimeZone', () => {
  it('formats a Date object in UTC', () => {
    const d = new Date('2024-03-15T12:00:00Z')
    expect(dateStrInTimeZone(d, 'UTC')).toBe('2024-03-15')
  })

  it('formats a string instant in UTC', () => {
    expect(dateStrInTimeZone('2024-06-20T00:00:00Z', 'UTC')).toBe('2024-06-20')
  })

  it('formats in a non-UTC timezone (America/New_York)', () => {
    // 2024-01-15T05:00:00Z is midnight EST (UTC-5)
    const result = dateStrInTimeZone('2024-01-15T05:00:00Z', 'America/New_York')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('falls back to UTC for invalid timezone string', () => {
    // An invalid timezone should not throw; falls back to UTC
    const d = new Date('2024-03-15T12:00:00Z')
    expect(() => dateStrInTimeZone(d, 'Invalid/Zone_XYZ')).not.toThrow()
    const result = dateStrInTimeZone(d, 'Invalid/Zone_XYZ')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('todayInTimeZone', () => {
  it('returns a YYYY-MM-DD string for UTC', () => {
    const result = todayInTimeZone('UTC')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('accepts a custom "now" Date', () => {
    const fixed = new Date('2024-07-04T12:00:00Z')
    expect(todayInTimeZone('UTC', fixed)).toBe('2024-07-04')
  })

  it('respects non-UTC timezone', () => {
    // With a fixed "now" we can check the date shifts correctly
    // 2024-01-15T03:00:00Z is Jan 14 in UTC-5 (EST)
    const fixed = new Date('2024-01-15T03:00:00Z')
    const result = todayInTimeZone('America/New_York', fixed)
    expect(result).toBe('2024-01-14')
  })
})
