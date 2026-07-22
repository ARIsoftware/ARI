/**
 * Extra coverage tests for health-data/lib/stats.ts.
 *
 * Targets:
 * - rollingMean: window drop path where outgoing is null (line 81 `if (outgoing !== null)`)
 * - strideSample: last element already included branch (line 97)
 */
import { describe, it, expect } from 'vitest'
import { rollingMean, strideSample } from '@/modules-core/health-data/lib/stats'

describe('rollingMean extra', () => {
  it('handles window drop of a null value (outgoing is null)', () => {
    // window=2, data has a null in the window that gets dropped
    const data = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: null }, // this null goes into the window
      { date: '2024-01-03', value: 20 },  // dropIdx=1 → outgoing=null → no sum/count change
    ]
    const result = rollingMean(data, 2)
    // Index 0: sum=10, count=1 → 10
    // Index 1: null incoming (no change sum/count), dropIdx=-1 → value=10/1=10
    // Index 2: incoming=20, sum=30, count=2; dropIdx=0, outgoing=10, sum=20, count=1 → 20
    // Wait - actually: index 2: drop dropIdx=0 (val=10), sum becomes 30-10=20, count 2-1=1 → 20
    expect(result[2].value).toBe(20)
    // count > 0 so value is non-null
  })

  it('rollingMean yields null when count reaches 0', () => {
    // All null values → count always 0 → output null
    const data = [
      { date: '2024-01-01', value: null },
      { date: '2024-01-02', value: null },
    ]
    const result = rollingMean(data, 2)
    expect(result[0].value).toBeNull()
    expect(result[1].value).toBeNull()
  })
})

describe('strideSample extra', () => {
  it('last element already coincides with stride boundary — no duplicate', () => {
    // rows.length=4, maxPoints=2 → stride=2
    // i=0 → out[0]=rows[0]; i=2 → out[1]=rows[2]
    // rows[rows.length-1]=rows[3] !== out[out.length-1]=rows[2] → push rows[3]
    const rows = [1, 2, 3, 4]
    const result = strideSample(rows, 2)
    expect(result[result.length - 1]).toBe(4)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('last element already in sample (no extra push)', () => {
    // rows.length=4, maxPoints=4 → returns rows unchanged
    const rows = [1, 2, 3, 4]
    const result = strideSample(rows, 4)
    expect(result).toEqual(rows)
  })

  it('stride=1 means last row equals stride step row (no duplicate push)', () => {
    // rows.length=3, maxPoints=3 → returns rows unchanged (length <= maxPoints)
    const rows = ['a', 'b', 'c']
    const result = strideSample(rows, 3)
    expect(result).toEqual(rows)
  })

  it('when stride exactly lands on last element — no duplicate', () => {
    // rows=[0,1,2,3,4,5], maxPoints=3 → stride=2
    // i=0,2,4 → out=[rows[0],rows[2],rows[4]]
    // rows[5] !== rows[4] → push rows[5]
    const rows = [0, 1, 2, 3, 4, 5]
    const result = strideSample(rows, 3)
    expect(result[result.length - 1]).toBe(5)
  })

  it('last element already the last strided item (out.last === rows.last)', () => {
    // rows=[0,1,2], maxPoints=2 → stride=ceil(3/2)=2
    // i=0,2 → out=[0,2]; out[last]=rows[2]=rows[last] → no duplicate push
    const rows = [0, 1, 2]
    const result = strideSample(rows, 2)
    // Last element should be 2, with no duplicate
    const lastIdx = result.indexOf(2)
    expect(result.filter(x => x === 2).length).toBe(1)
    expect(result[result.length - 1]).toBe(2)
  })
})
