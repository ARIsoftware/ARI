import { describe, it, expect } from 'vitest'
import {
  fmtNumber,
  fmtDuration,
  fmtDate,
  fmtDateShort,
  fmtDateTime,
  fmtCountdown,
  fmtDistanceKm,
} from '@/modules-core/health-data/lib/format'

describe('fmtNumber', () => {
  it('formats integer with 0 decimals by default', () => {
    expect(fmtNumber(1234)).toBe('1,234')
  })

  it('formats with specified decimals', () => {
    expect(fmtNumber(3.14159, 2)).toBe('3.14')
  })

  it('returns em-dash for null', () => {
    expect(fmtNumber(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(fmtNumber(undefined)).toBe('—')
  })

  it('returns em-dash for NaN', () => {
    expect(fmtNumber(NaN)).toBe('—')
  })

  it('returns em-dash for Infinity', () => {
    expect(fmtNumber(Infinity)).toBe('—')
  })

  it('returns em-dash for -Infinity', () => {
    expect(fmtNumber(-Infinity)).toBe('—')
  })

  it('formats zero', () => {
    expect(fmtNumber(0)).toBe('0')
  })

  it('formats negative numbers', () => {
    expect(fmtNumber(-5)).toBe('-5')
  })
})

describe('fmtDuration', () => {
  it('formats minutes only when less than 60', () => {
    expect(fmtDuration(45)).toBe('45m')
  })

  it('formats hours and minutes', () => {
    expect(fmtDuration(452)).toBe('7h 32m')
  })

  it('formats exactly one hour', () => {
    expect(fmtDuration(60)).toBe('1h 0m')
  })

  it('formats 0 minutes', () => {
    expect(fmtDuration(0)).toBe('0m')
  })

  it('rounds fractional minutes', () => {
    expect(fmtDuration(90.6)).toBe('1h 31m')
  })

  it('returns em-dash for null', () => {
    expect(fmtDuration(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(fmtDuration(undefined)).toBe('—')
  })

  it('returns em-dash for NaN', () => {
    expect(fmtDuration(NaN)).toBe('—')
  })

  it('returns em-dash for Infinity', () => {
    expect(fmtDuration(Infinity)).toBe('—')
  })
})

describe('fmtDate', () => {
  it('formats a YYYY-MM-DD string', () => {
    // Output is locale-dependent; check the shape contains the year and month
    const result = fmtDate('2026-07-08')
    expect(result).toContain('2026')
    expect(result).toContain('8')
  })

  it('returns em-dash for null', () => {
    expect(fmtDate(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(fmtDate(undefined)).toBe('—')
  })

  it('returns em-dash for empty string', () => {
    expect(fmtDate('')).toBe('—')
  })

  it('returns the raw string when parts are invalid (month=0)', () => {
    // '2026-00-08' → month parses to 0, which is falsy
    const raw = '2026-00-08'
    expect(fmtDate(raw)).toBe(raw)
  })

  it('accepts ISO timestamps and uses first 10 chars', () => {
    const result = fmtDate('2026-07-08T15:30:00')
    expect(result).toContain('2026')
    expect(result).toContain('8')
  })
})

describe('fmtDateShort', () => {
  it('formats a date to short form', () => {
    const result = fmtDateShort('2026-07-08')
    // Locale-dependent, but should include both month abbreviation and day
    expect(result).toContain('8')
  })

  it('returns empty string for null', () => {
    expect(fmtDateShort(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(fmtDateShort(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(fmtDateShort('')).toBe('')
  })

  it('returns raw string when parts are zero/falsy', () => {
    const raw = '2026-00-08'
    expect(fmtDateShort(raw)).toBe(raw)
  })
})

describe('fmtDateTime', () => {
  it('formats ISO timestamp (with offset) preserving wall-clock time', () => {
    const result = fmtDateTime('2026-07-08T21:41:00-04:00')
    expect(result).toContain('2026')
    expect(result).toContain('41')
  })

  it('returns em-dash for null', () => {
    expect(fmtDateTime(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(fmtDateTime(undefined)).toBe('—')
  })

  it('returns em-dash for empty string', () => {
    expect(fmtDateTime('')).toBe('—')
  })

  it('returns the raw string when the pattern does not match', () => {
    expect(fmtDateTime('not-a-date')).toBe('not-a-date')
  })

  it('handles basic ISO without offset', () => {
    const result = fmtDateTime('2026-01-15T09:05')
    expect(result).toContain('2026')
    expect(result).toContain('05')
  })
})

describe('fmtCountdown', () => {
  it('returns "0m" for 0 ms', () => {
    expect(fmtCountdown(0)).toBe('0m')
  })

  it('returns "0m" for negative ms', () => {
    expect(fmtCountdown(-1000)).toBe('0m')
  })

  it('rounds up partial minutes', () => {
    expect(fmtCountdown(1)).toBe('1m')   // 1ms → ceil to 1m
    expect(fmtCountdown(60000)).toBe('1m')
    expect(fmtCountdown(60001)).toBe('2m') // just over 1 minute
  })

  it('formats many minutes', () => {
    expect(fmtCountdown(10 * 60000)).toBe('10m')
  })
})

describe('fmtDistanceKm', () => {
  it('formats distance with 1 decimal for values under 100', () => {
    const result = fmtDistanceKm(5.3)
    expect(result).toBe('5.3 km')
  })

  it('formats distance with 0 decimals for values >= 100', () => {
    const result = fmtDistanceKm(100)
    expect(result).toBe('100 km')
  })

  it('returns em-dash for null', () => {
    expect(fmtDistanceKm(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(fmtDistanceKm(undefined)).toBe('—')
  })

  it('returns em-dash for NaN', () => {
    expect(fmtDistanceKm(NaN)).toBe('—')
  })

  it('formats zero distance', () => {
    expect(fmtDistanceKm(0)).toBe('0.0 km')
  })

  it('uses 0 decimals for exactly 100 km', () => {
    expect(fmtDistanceKm(100)).toBe('100 km')
  })

  it('uses 1 decimal for 99.9 km', () => {
    expect(fmtDistanceKm(99.9)).toBe('99.9 km')
  })
})
