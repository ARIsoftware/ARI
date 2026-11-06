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
  formatEventDate,
  MONTH_SEGMENTS,
  YEAR_SEGMENTS,
  ALL_DAYS,
} from '@/modules-core/timeline/lib/timeline-range'

// ─── constants ────────────────────────────────────────────────────────────────

describe('range constants', () => {
  it('span Sep 1, 2026 – Dec 31, 2040', () => {
    expect(TIMELINE_START).toBe('2026-09-01')
    expect(TIMELINE_END).toBe('2040-12-31')
    expect(TIMELINE_RANGE_LABEL).toBe('Sep 1, 2026 – Dec 31, 2040')
  })

  it('caps event names at 100 chars', () => {
    expect(EVENT_NAME_MAX).toBe(100)
  })

  it('TOTAL_DAYS covers Sep–Dec 2026 (122) plus 14 full years with 4 leap days', () => {
    expect(TOTAL_DAYS).toBe(122 + 14 * 365 + 4)
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
    expect(dayIndexOf('2027-01-01')).toBe(122)
    expect(dayIndexOf('2040-12-31')).toBe(TOTAL_DAYS - 1)
  })
})

describe('dayInfoOf', () => {
  it('round-trips with dayIndexOf', () => {
    expect(dayInfoOf(0)).toEqual({ iso: '2026-09-01', day: 1, month: 9, year: 2026 })
    expect(dayInfoOf(30)).toEqual({ iso: '2026-10-01', day: 1, month: 10, year: 2026 })
    expect(dayInfoOf(121)).toEqual({ iso: '2026-12-31', day: 31, month: 12, year: 2026 })
    expect(dayInfoOf(122)).toEqual({ iso: '2027-01-01', day: 1, month: 1, year: 2027 })
    expect(dayInfoOf(TOTAL_DAYS - 1)).toEqual({ iso: '2040-12-31', day: 31, month: 12, year: 2040 })
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

describe('formatEventDate', () => {
  it('omits the year inside the current year', () => {
    expect(formatEventDate('2026-09-08', '2026-11-05')).toBe('Sep 8')
    expect(formatEventDate('2026-12-31', '2026-01-01')).toBe('Dec 31')
  })

  it('appends the year outside the current year', () => {
    expect(formatEventDate('2027-12-30', '2026-11-05')).toBe('Dec 30, 2027')
    expect(formatEventDate('2026-09-08', '2027-01-01')).toBe('Sep 8, 2026')
  })
})

// ─── MONTH_SEGMENTS / ALL_DAYS ────────────────────────────────────────────────

describe('MONTH_SEGMENTS', () => {
  it('has one contiguous segment per month in the range', () => {
    expect(MONTH_SEGMENTS).toHaveLength(4 + 14 * 12)
    expect(MONTH_SEGMENTS.slice(0, 5)).toEqual([
      { label: 'SEP 2026', year: 2026, month: 9, startIndex: 0, endIndex: 29 },
      { label: 'OCT', year: 2026, month: 10, startIndex: 30, endIndex: 60 },
      { label: 'NOV', year: 2026, month: 11, startIndex: 61, endIndex: 90 },
      { label: 'DEC', year: 2026, month: 12, startIndex: 91, endIndex: 121 },
      { label: 'JAN 2027', year: 2027, month: 1, startIndex: 122, endIndex: 152 },
    ])
    expect(MONTH_SEGMENTS[MONTH_SEGMENTS.length - 1]).toEqual({
      label: 'DEC',
      year: 2040,
      month: 12,
      startIndex: TOTAL_DAYS - 31,
      endIndex: TOTAL_DAYS - 1,
    })
  })

  it('names the year on the first month and on every January only', () => {
    const withYear = MONTH_SEGMENTS.filter((seg) => / \d{4}$/.test(seg.label))
    expect(withYear).toHaveLength(1 + 14)
    expect(withYear.slice(1).every((seg) => seg.month === 1)).toBe(true)
  })

  it('segments are contiguous and cover every day exactly once', () => {
    let next = 0
    for (const seg of MONTH_SEGMENTS) {
      expect(seg.startIndex).toBe(next)
      next = seg.endIndex + 1
    }
    expect(next).toBe(TOTAL_DAYS)
  })
})

describe('YEAR_SEGMENTS', () => {
  it('has one segment per calendar year from 2026 to 2040', () => {
    expect(YEAR_SEGMENTS).toHaveLength(15)
    expect(YEAR_SEGMENTS[0]).toEqual({ year: 2026, startIndex: 0, endIndex: 121 })
    expect(YEAR_SEGMENTS[1]).toEqual({ year: 2027, startIndex: 122, endIndex: 486 })
    // 2040 is a leap year (366 days)
    expect(YEAR_SEGMENTS[14]).toEqual({
      year: 2040,
      startIndex: TOTAL_DAYS - 366,
      endIndex: TOTAL_DAYS - 1,
    })
  })
})

describe('ALL_DAYS', () => {
  it('precomputes every day in the range in order', () => {
    expect(ALL_DAYS).toHaveLength(TOTAL_DAYS)
    expect(ALL_DAYS[0].iso).toBe('2026-09-01')
    expect(ALL_DAYS[ALL_DAYS.length - 1].iso).toBe('2040-12-31')
    expect(ALL_DAYS[30]).toEqual(dayInfoOf(30))
  })
})
