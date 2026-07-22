/**
 * Tests for tasks/lib/analytics-utils.ts — pure date/streak helpers.
 * No mocks needed: all functions are pure (operate on strings / Date UTC).
 */
import { describe, it, expect } from 'vitest'
import {
  WEEKDAYS,
  addDays,
  isoWeekdayFromDate,
  startOfIsoWeek,
  currentDayStreak,
  computeLongestStreak,
} from '@/modules-core/tasks/lib/analytics-utils'

// ─── WEEKDAYS constant ──────────────────────────────────────────────────────

describe('WEEKDAYS', () => {
  it('has 7 entries', () => {
    expect(WEEKDAYS).toHaveLength(7)
  })

  it('starts at 1 (Monday) and ends at 7 (Sunday)', () => {
    expect(WEEKDAYS[0].value).toBe(1)
    expect(WEEKDAYS[6].value).toBe(7)
  })

  it('has correct labels', () => {
    expect(WEEKDAYS[0].label).toBe('Monday')
    expect(WEEKDAYS[6].label).toBe('Sunday')
  })

  it('has correct short labels', () => {
    expect(WEEKDAYS[0].short).toBe('Mon')
    expect(WEEKDAYS[4].short).toBe('Fri')
    expect(WEEKDAYS[6].short).toBe('Sun')
  })
})

// ─── addDays ────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('adds a positive number of days', () => {
    expect(addDays('2024-01-01', 1)).toBe('2024-01-02')
  })

  it('adds across month boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01')
  })

  it('adds across year boundaries', () => {
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01')
  })

  it('subtracts days with a negative number', () => {
    expect(addDays('2024-01-02', -1)).toBe('2024-01-01')
  })

  it('adds zero days returns same date', () => {
    expect(addDays('2024-06-15', 0)).toBe('2024-06-15')
  })

  it('handles leap year correctly (Feb 28 + 1 = Feb 29)', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('adds large number of days', () => {
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01') // 2024 is a leap year
  })
})

// ─── isoWeekdayFromDate ─────────────────────────────────────────────────────

describe('isoWeekdayFromDate', () => {
  // 2024-01-01 is a Monday
  it('returns 1 for Monday 2024-01-01', () => {
    expect(isoWeekdayFromDate('2024-01-01')).toBe(1)
  })

  it('returns 7 for Sunday (ISO convention)', () => {
    // 2024-01-07 is a Sunday
    expect(isoWeekdayFromDate('2024-01-07')).toBe(7)
  })

  it('returns 2 for Tuesday', () => {
    expect(isoWeekdayFromDate('2024-01-02')).toBe(2)
  })

  it('returns 3 for Wednesday', () => {
    expect(isoWeekdayFromDate('2024-01-03')).toBe(3)
  })

  it('returns 4 for Thursday', () => {
    expect(isoWeekdayFromDate('2024-01-04')).toBe(4)
  })

  it('returns 5 for Friday', () => {
    expect(isoWeekdayFromDate('2024-01-05')).toBe(5)
  })

  it('returns 6 for Saturday', () => {
    expect(isoWeekdayFromDate('2024-01-06')).toBe(6)
  })

  it('is timezone-independent (UTC midnight parse)', () => {
    // 2024-07-04 is a Thursday
    expect(isoWeekdayFromDate('2024-07-04')).toBe(4)
  })
})

// ─── startOfIsoWeek ─────────────────────────────────────────────────────────

describe('startOfIsoWeek', () => {
  it('Monday returns itself', () => {
    expect(startOfIsoWeek('2024-01-01')).toBe('2024-01-01')
  })

  it('Sunday returns the preceding Monday', () => {
    expect(startOfIsoWeek('2024-01-07')).toBe('2024-01-01')
  })

  it('Wednesday returns the preceding Monday', () => {
    expect(startOfIsoWeek('2024-01-03')).toBe('2024-01-01')
  })

  it('Friday returns the preceding Monday', () => {
    expect(startOfIsoWeek('2024-01-05')).toBe('2024-01-01')
  })

  it('handles a cross-month Monday', () => {
    // 2024-01-29 is a Monday
    expect(startOfIsoWeek('2024-02-02')).toBe('2024-01-29')
  })
})

// ─── currentDayStreak ───────────────────────────────────────────────────────

describe('currentDayStreak', () => {
  it('returns 0 when the set is empty', () => {
    expect(currentDayStreak(new Set(), '2024-01-10')).toBe(0)
  })

  it('returns 1 when only today is in the set', () => {
    expect(currentDayStreak(new Set(['2024-01-10']), '2024-01-10')).toBe(1)
  })

  it('returns the run length for consecutive days ending today', () => {
    const dates = new Set(['2024-01-08', '2024-01-09', '2024-01-10'])
    expect(currentDayStreak(dates, '2024-01-10')).toBe(3)
  })

  it('grace period: if today is missing, starts from yesterday', () => {
    // today is 2024-01-10 but not in set — yesterday IS in set
    const dates = new Set(['2024-01-08', '2024-01-09'])
    expect(currentDayStreak(dates, '2024-01-10')).toBe(2)
  })

  it('returns 0 when neither today nor yesterday is in the set', () => {
    const dates = new Set(['2024-01-07', '2024-01-06'])
    expect(currentDayStreak(dates, '2024-01-10')).toBe(0)
  })

  it('does not count a gap in the middle', () => {
    // today=01-10 in set, 01-09 missing => run starts only from 01-10
    const dates = new Set(['2024-01-10', '2024-01-08'])
    expect(currentDayStreak(dates, '2024-01-10')).toBe(1)
  })

  it('long streak counts correctly', () => {
    const dates = new Set(
      Array.from({ length: 30 }, (_, i) => addDays('2024-01-01', i))
    )
    expect(currentDayStreak(dates, '2024-01-30')).toBe(30)
  })
})

// ─── computeLongestStreak ────────────────────────────────────────────────────

describe('computeLongestStreak', () => {
  it('returns 0 for empty input', () => {
    expect(computeLongestStreak([])).toBe(0)
  })

  it('returns 1 for a single date', () => {
    expect(computeLongestStreak(['2024-01-01'])).toBe(1)
  })

  it('returns length of fully consecutive list', () => {
    expect(computeLongestStreak(['2024-01-01', '2024-01-02', '2024-01-03'])).toBe(3)
  })

  it('finds the longest run among multiple runs', () => {
    const dates = [
      '2024-01-01', '2024-01-02', // run of 2
      '2024-01-10', '2024-01-11', '2024-01-12', '2024-01-13', // run of 4
      '2024-01-20', // run of 1
    ]
    expect(computeLongestStreak(dates)).toBe(4)
  })

  it('handles a single two-day gap correctly', () => {
    const dates = ['2024-01-01', '2024-01-03'] // gap on 2nd
    expect(computeLongestStreak(dates)).toBe(1)
  })

  it('correctly handles run at start', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-05', '2024-01-06']
    expect(computeLongestStreak(dates)).toBe(2)
  })

  it('handles all dates non-consecutive', () => {
    const dates = ['2024-01-01', '2024-01-03', '2024-01-05']
    expect(computeLongestStreak(dates)).toBe(1)
  })
})
