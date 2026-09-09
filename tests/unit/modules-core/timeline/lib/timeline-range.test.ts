import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  TIMELINE_START,
  TIMELINE_END,
  TIMELINE_RANGE_LABEL,
  EVENT_NAME_MAX,
  isValidIsoDate,
  dayIndexOf,
  TOTAL_DAYS,
  dayInfoOf,
  todayIso,
  formatShortDate,
  MONTH_SEGMENTS,
  ALL_DAYS,
} from '@/modules-core/timeline/lib/timeline-range'

// ─── constants ────────────────────────────────────────────────────────────────

describe('range constants', () => {
  it('span Sep 1 – Dec 31, 2026', () => {
    expect(TIMELINE_START).toBe('2026-09-01')
    expect(TIMELINE_END).toBe('2026-12-31')
    expect(TIMELINE_RANGE_LABEL).toBe('Sep 1 – Dec 31, 2026')
  })

  it('caps event names at 100 chars', () => {
    expect(EVENT_NAME_MAX).toBe(100)
  })

  it('TOTAL_DAYS covers Sep(30)+Oct(31)+Nov(30)+Dec(31)', () => {
    expect(TOTAL_DAYS).toBe(122)
  })
})

// ─── isValidIsoDate ───────────────────────────────────────────────────────────

describe('isValidIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidIsoDate('2026-09-01')).toBe(true)
    expect(isValidIsoDate('2026-12-31')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true) // leap year
  })

  it('rejects rollover dates', () => {
    expect(isValidIsoDate('2026-09-31')).toBe(false)
    expect(isValidIsoDate('2026-02-29')).toBe(false) // not a leap year
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-00-10')).toBe(false)
  })
})

// ─── dayIndexOf / dayInfoOf ───────────────────────────────────────────────────

describe('dayIndexOf', () => {
  it('is zero-based from TIMELINE_START', () => {
    expect(dayIndexOf('2026-09-01')).toBe(0)
    expect(dayIndexOf('2026-09-02')).toBe(1)
    expect(dayIndexOf('2026-10-01')).toBe(30)
    expect(dayIndexOf('2026-12-31')).toBe(121)
  })
})

describe('dayInfoOf', () => {
  it('round-trips with dayIndexOf', () => {
    expect(dayInfoOf(0)).toEqual({ iso: '2026-09-01', day: 1, month: 9 })
    expect(dayInfoOf(30)).toEqual({ iso: '2026-10-01', day: 1, month: 10 })
    expect(dayInfoOf(121)).toEqual({ iso: '2026-12-31', day: 31, month: 12 })
  })
})

// ─── todayIso ─────────────────────────────────────────────────────────────────

describe('todayIso', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns today's local date as YYYY-MM-DD with zero padding", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0, 0)) // local Sep 5, 2026
    expect(todayIso()).toBe('2026-09-05')
  })
})

// ─── formatShortDate ──────────────────────────────────────────────────────────

describe('formatShortDate', () => {
  it("formats '2026-09-08' as 'Sep 8'", () => {
    expect(formatShortDate('2026-09-08')).toBe('Sep 8')
    expect(formatShortDate('2026-12-31')).toBe('Dec 31')
  })
})

// ─── MONTH_SEGMENTS / ALL_DAYS ────────────────────────────────────────────────

describe('MONTH_SEGMENTS', () => {
  it('has one contiguous segment per month in the range', () => {
    expect(MONTH_SEGMENTS).toEqual([
      { label: 'SEP', startIndex: 0, endIndex: 29 },
      { label: 'OCT', startIndex: 30, endIndex: 60 },
      { label: 'NOV', startIndex: 61, endIndex: 90 },
      { label: 'DEC', startIndex: 91, endIndex: 121 },
    ])
  })
})

describe('ALL_DAYS', () => {
  it('precomputes every day in the range in order', () => {
    expect(ALL_DAYS).toHaveLength(TOTAL_DAYS)
    expect(ALL_DAYS[0].iso).toBe('2026-09-01')
    expect(ALL_DAYS[ALL_DAYS.length - 1].iso).toBe('2026-12-31')
    expect(ALL_DAYS[30]).toEqual(dayInfoOf(30))
  })
})
