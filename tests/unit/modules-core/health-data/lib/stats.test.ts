import { describe, it, expect } from 'vitest'
import {
  averageOf,
  totalOf,
  latestOf,
  avgNumbers,
  toLocalDateString,
  weekStart,
  rollingMean,
  strideSample,
  bucketWeekly,
  WEEKLY_BUCKET_THRESHOLD,
} from '@/modules-core/health-data/lib/stats'

describe('averageOf', () => {
  it('returns null for undefined input', () => {
    expect(averageOf(undefined)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(averageOf([])).toBeNull()
  })

  it('returns null when all values are null', () => {
    expect(averageOf([{ date: '2026-01-01', value: null }])).toBeNull()
  })

  it('computes average of non-null values', () => {
    const data = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 20 },
      { date: '2026-01-03', value: 30 },
    ]
    expect(averageOf(data)).toBe(20)
  })

  it('skips null values in average', () => {
    const data = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: null },
      { date: '2026-01-03', value: 30 },
    ]
    expect(averageOf(data)).toBe(20)
  })

  it('returns single value when only one non-null', () => {
    expect(averageOf([{ date: '2026-01-01', value: 42 }])).toBe(42)
  })
})

describe('totalOf', () => {
  it('returns null for undefined input', () => {
    expect(totalOf(undefined)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(totalOf([])).toBeNull()
  })

  it('sums all values, treating null as 0', () => {
    const data = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: null },
      { date: '2026-01-03', value: 5 },
    ]
    expect(totalOf(data)).toBe(15)
  })

  it('returns 0 when all values are null', () => {
    expect(totalOf([{ date: '2026-01-01', value: null }])).toBe(0)
  })
})

describe('latestOf', () => {
  it('returns null for undefined input', () => {
    expect(latestOf(undefined)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(latestOf([])).toBeNull()
  })

  it('returns null when all values are null', () => {
    expect(latestOf([{ date: '2026-01-01', value: null }])).toBeNull()
  })

  it('returns the last non-null value', () => {
    const data = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 20 },
      { date: '2026-01-03', value: null },
    ]
    expect(latestOf(data)).toBe(20)
  })

  it('returns the last element when all non-null', () => {
    const data = [
      { date: '2026-01-01', value: 1 },
      { date: '2026-01-02', value: 2 },
      { date: '2026-01-03', value: 3 },
    ]
    expect(latestOf(data)).toBe(3)
  })

  it('skips trailing nulls to find last non-null', () => {
    const data = [
      { date: '2026-01-01', value: null },
      { date: '2026-01-02', value: 42 },
      { date: '2026-01-03', value: null },
      { date: '2026-01-04', value: null },
    ]
    expect(latestOf(data)).toBe(42)
  })
})

describe('avgNumbers', () => {
  it('returns null for empty array', () => {
    expect(avgNumbers([])).toBeNull()
  })

  it('averages a single value', () => {
    expect(avgNumbers([5])).toBe(5)
  })

  it('averages multiple values', () => {
    expect(avgNumbers([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('toLocalDateString', () => {
  it('formats a date in local time (YYYY-MM-DD)', () => {
    // Create a specific local date
    const date = new Date(2026, 6, 8) // July 8, 2026 local time
    expect(toLocalDateString(date)).toBe('2026-07-08')
  })

  it('pads month and day with zeros', () => {
    const date = new Date(2026, 0, 1) // January 1, 2026 local time
    expect(toLocalDateString(date)).toBe('2026-01-01')
  })

  it('handles day 31', () => {
    const date = new Date(2026, 11, 31) // December 31, 2026
    expect(toLocalDateString(date)).toBe('2026-12-31')
  })
})

describe('weekStart', () => {
  it('returns Monday for a Monday date', () => {
    // 2026-07-06 is a Monday
    expect(weekStart('2026-07-06')).toBe('2026-07-06')
  })

  it('returns the previous Monday for a Wednesday', () => {
    // 2026-07-08 is a Wednesday; previous Monday is 2026-07-06
    expect(weekStart('2026-07-08')).toBe('2026-07-06')
  })

  it('returns the previous Monday for a Sunday', () => {
    // 2026-07-12 is a Sunday; previous Monday is 2026-07-06
    expect(weekStart('2026-07-12')).toBe('2026-07-06')
  })

  it('handles the start of the year correctly', () => {
    // 2026-01-01 is a Thursday; previous Monday is 2025-12-29
    expect(weekStart('2026-01-01')).toBe('2025-12-29')
  })
})

describe('WEEKLY_BUCKET_THRESHOLD', () => {
  it('is 200', () => {
    expect(WEEKLY_BUCKET_THRESHOLD).toBe(200)
  })
})

describe('rollingMean', () => {
  it('returns empty array for empty input', () => {
    expect(rollingMean([], 7)).toEqual([])
  })

  it('computes trailing mean over window', () => {
    const data = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 20 },
      { date: '2026-01-03', value: 30 },
    ]
    const result = rollingMean(data, 2)
    expect(result[0].value).toBe(10)  // only 1 point
    expect(result[1].value).toBe(15)  // (10+20)/2
    expect(result[2].value).toBe(25)  // (20+30)/2
  })

  it('skips null values in the window', () => {
    const data = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: null },
      { date: '2026-01-03', value: 30 },
    ]
    const result = rollingMean(data, 3)
    expect(result[0].value).toBe(10)
    expect(result[1].value).toBe(10) // only non-null: 10
    expect(result[2].value).toBe(20) // (10+30)/2
  })

  it('outputs null when all values in window are null', () => {
    const data = [
      { date: '2026-01-01', value: null },
      { date: '2026-01-02', value: null },
    ]
    const result = rollingMean(data, 3)
    expect(result[0].value).toBeNull()
    expect(result[1].value).toBeNull()
  })

  it('preserves dates from the input', () => {
    const data = [
      { date: '2026-01-05', value: 5 },
      { date: '2026-01-06', value: 6 },
    ]
    const result = rollingMean(data, 3)
    expect(result[0].date).toBe('2026-01-05')
    expect(result[1].date).toBe('2026-01-06')
  })

  it('handles window larger than data length', () => {
    const data = [
      { date: '2026-01-01', value: 4 },
      { date: '2026-01-02', value: 6 },
    ]
    const result = rollingMean(data, 10)
    expect(result[0].value).toBe(4)
    expect(result[1].value).toBe(5)  // (4+6)/2
  })

  it('drops data outside the window from the average', () => {
    // Window = 1: each point is just itself
    const data = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-02', value: 200 },
      { date: '2026-01-03', value: 300 },
    ]
    const result = rollingMean(data, 1)
    expect(result[0].value).toBe(100)
    expect(result[1].value).toBe(200)
    expect(result[2].value).toBe(300)
  })
})

describe('strideSample', () => {
  it('returns the array unchanged when at or below maxPoints', () => {
    const rows = [1, 2, 3]
    expect(strideSample(rows, 3)).toEqual([1, 2, 3])
    expect(strideSample(rows, 10)).toEqual([1, 2, 3])
  })

  it('reduces to roughly maxPoints entries', () => {
    const rows = Array.from({ length: 100 }, (_, i) => i)
    const sampled = strideSample(rows, 10)
    // Should be close to 10 (may be 11 due to last-element preservation)
    expect(sampled.length).toBeGreaterThanOrEqual(10)
    expect(sampled.length).toBeLessThanOrEqual(11)
  })

  it('always includes the last element', () => {
    const rows = Array.from({ length: 100 }, (_, i) => i)
    const sampled = strideSample(rows, 10)
    expect(sampled[sampled.length - 1]).toBe(99)
  })

  it('handles empty array', () => {
    expect(strideSample([], 5)).toEqual([])
  })

  it('handles single element', () => {
    expect(strideSample([42], 5)).toEqual([42])
  })
})

describe('bucketWeekly', () => {
  it('returns empty array for empty input', () => {
    expect(bucketWeekly([], ['value' as any])).toEqual([])
  })

  it('aggregates daily rows into weekly rows with avg by default', () => {
    const rows = [
      { date: '2026-07-06', value: 10 },  // Monday
      { date: '2026-07-07', value: 20 },  // Tuesday
      { date: '2026-07-08', value: 30 },  // Wednesday
    ]
    const result = bucketWeekly(rows, ['value' as any])
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-07-06') // week start = Monday
    expect((result[0] as any).value).toBe(20)  // avg of 10, 20, 30
  })

  it('creates separate buckets for different weeks', () => {
    const rows = [
      { date: '2026-07-06', value: 10 },  // week 1
      { date: '2026-07-13', value: 20 },  // week 2
    ]
    const result = bucketWeekly(rows, ['value' as any])
    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2026-07-06')
    expect(result[1].date).toBe('2026-07-13')
  })

  it('uses sum mode when specified', () => {
    const rows = [
      { date: '2026-07-06', value: 10 },
      { date: '2026-07-07', value: 20 },
    ]
    const result = bucketWeekly(rows, ['value' as any], { value: 'sum' } as any)
    expect((result[0] as any).value).toBe(30)
  })

  it('uses min mode when specified', () => {
    const rows = [
      { date: '2026-07-06', value: 5 },
      { date: '2026-07-07', value: 15 },
      { date: '2026-07-08', value: 10 },
    ]
    const result = bucketWeekly(rows, ['value' as any], { value: 'min' } as any)
    expect((result[0] as any).value).toBe(5)
  })

  it('uses max mode when specified', () => {
    const rows = [
      { date: '2026-07-06', value: 5 },
      { date: '2026-07-07', value: 15 },
      { date: '2026-07-08', value: 10 },
    ]
    const result = bucketWeekly(rows, ['value' as any], { value: 'max' } as any)
    expect((result[0] as any).value).toBe(15)
  })

  it('handles non-numeric fields by setting them to null', () => {
    const rows = [
      { date: '2026-07-06', value: 'not-a-number' as any },
    ]
    const result = bucketWeekly(rows, ['value' as any])
    expect((result[0] as any).value).toBeNull()
  })

  it('handles Infinity in values (non-finite) by setting null', () => {
    const rows = [
      { date: '2026-07-06', value: Infinity },
    ]
    const result = bucketWeekly(rows, ['value' as any])
    expect((result[0] as any).value).toBeNull()
  })

  it('sorts weeks chronologically', () => {
    const rows = [
      { date: '2026-07-13', value: 2 },
      { date: '2026-07-06', value: 1 },
    ]
    const result = bucketWeekly(rows, ['value' as any])
    expect(result[0].date).toBe('2026-07-06')
    expect(result[1].date).toBe('2026-07-13')
  })

  it('handles multiple fields independently', () => {
    const rows = [
      { date: '2026-07-06', a: 10, b: 100 },
      { date: '2026-07-07', a: 20, b: 200 },
    ]
    const result = bucketWeekly(rows, ['a' as any, 'b' as any])
    expect((result[0] as any).a).toBe(15)
    expect((result[0] as any).b).toBe(150)
  })
})
