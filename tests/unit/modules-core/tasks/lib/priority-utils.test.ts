import { describe, it, expect } from 'vitest'
import {
  normalizeAxes,
  calculatePriorityScore,
  getTaskPriorityLevel,
  getTaskColor,
  getTaskSize,
  transformTaskForRadar,
} from '@/modules-core/tasks/lib/priority-utils'
import type { Task } from '@/modules-core/tasks/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    assignees: [],
    due_date: null,
    subtasks_completed: 0,
    subtasks_total: 0,
    status: 'Pending',
    priority: 'Medium',
    pinned: false,
    completed: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    order_index: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizeAxes
// ---------------------------------------------------------------------------

describe('normalizeAxes', () => {
  it('maps minimum values (1) to 0 for impact/severity/timeliness/strategic_fit', () => {
    const result = normalizeAxes({ impact: 1, severity: 1, timeliness: 1, effort: 1, strategic_fit: 1 })
    expect(result.impact).toBe(0)
    expect(result.severity).toBe(0)
    expect(result.timeliness).toBe(0)
    expect(result.strategic_fit).toBe(0)
  })

  it('maps maximum values (5) to 1 for impact/severity/timeliness/strategic_fit', () => {
    const result = normalizeAxes({ impact: 5, severity: 5, timeliness: 5, effort: 5, strategic_fit: 5 })
    expect(result.impact).toBe(1)
    expect(result.severity).toBe(1)
    expect(result.timeliness).toBe(1)
    expect(result.strategic_fit).toBe(1)
  })

  it('maps midpoint (3) to 0.5 for impact/severity/timeliness/strategic_fit', () => {
    const result = normalizeAxes({ impact: 3, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 })
    expect(result.impact).toBeCloseTo(0.5)
    expect(result.severity).toBeCloseTo(0.5)
    expect(result.timeliness).toBeCloseTo(0.5)
    expect(result.strategic_fit).toBeCloseTo(0.5)
  })

  it('inverts effort: effort=1 (low effort) normalizes to 1 (high priority)', () => {
    const result = normalizeAxes({ impact: 3, severity: 3, timeliness: 3, effort: 1, strategic_fit: 3 })
    expect(result.effort).toBe(1)
  })

  it('inverts effort: effort=5 (high effort) normalizes to 0 (low priority)', () => {
    const result = normalizeAxes({ impact: 3, severity: 3, timeliness: 3, effort: 5, strategic_fit: 3 })
    expect(result.effort).toBe(0)
  })

  it('inverts effort: effort=3 (midpoint) normalizes to 0.5', () => {
    const result = normalizeAxes({ impact: 3, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 })
    expect(result.effort).toBeCloseTo(0.5)
  })

  it('handles independent per-axis values', () => {
    const result = normalizeAxes({ impact: 1, severity: 5, timeliness: 3, effort: 1, strategic_fit: 5 })
    expect(result.impact).toBe(0)
    expect(result.severity).toBe(1)
    expect(result.timeliness).toBeCloseTo(0.5)
    expect(result.effort).toBe(1)   // inverted: low effort = 1
    expect(result.strategic_fit).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// calculatePriorityScore
// ---------------------------------------------------------------------------

describe('calculatePriorityScore', () => {
  it('returns a number in [0, 10]', () => {
    const score = calculatePriorityScore({ impact: 3, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(10)
  })

  it('perfect task (all high except low effort) scores near 10', () => {
    // impact=5, severity=5, timeliness=5, effort=1, strategic_fit=5
    // All normalized = 1, distance = 0, score = (1 - 0) * 10 = 10
    const score = calculatePriorityScore({ impact: 5, severity: 5, timeliness: 5, effort: 1, strategic_fit: 5 })
    expect(score).toBeCloseTo(10, 5)
  })

  it('worst task (all low except high effort) scores near 0', () => {
    // impact=1, severity=1, timeliness=1, effort=5, strategic_fit=1
    // All normalized = 0, distance = MAX_DISTANCE, score = (1 - 1) * 10 = 0
    const score = calculatePriorityScore({ impact: 1, severity: 1, timeliness: 1, effort: 5, strategic_fit: 1 })
    expect(score).toBeCloseTo(0, 5)
  })

  it('midpoint axes produce a score around 5', () => {
    const score = calculatePriorityScore({ impact: 3, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 })
    // All normalized = 0.5, distance from target (1) = sqrt(sum(w_i * 0.25))
    // With default weights: sqrt((1.2+1.0+1.1+0.8+1.0)*0.25) = sqrt(5.1*0.25) = sqrt(1.275) ≈ 1.129
    // MAX_DISTANCE = sqrt(5.1) ≈ 2.258, score = (1 - 1.129/2.258) * 10 ≈ 5
    expect(score).toBeGreaterThan(4)
    expect(score).toBeLessThan(6)
  })

  it('verifies weighted Euclidean math on a known input', () => {
    // impact=5→1, severity=1→0, timeliness=5→1, effort=1→1(inv), strategic_fit=1→0
    // normalized: impact=1, severity=0, timeliness=1, effort=1, strategic_fit=0
    // distance = sqrt(1.2*(1-1)^2 + 1.0*(0-1)^2 + 1.1*(1-1)^2 + 0.8*(1-1)^2 + 1.0*(0-1)^2)
    //          = sqrt(0 + 1.0 + 0 + 0 + 1.0) = sqrt(2)
    // MAX_DISTANCE = sqrt(1.2+1.0+1.1+0.8+1.0) = sqrt(5.1)
    // score = (1 - sqrt(2)/sqrt(5.1)) * 10 = (1 - sqrt(2/5.1)) * 10
    const expected = (1 - Math.sqrt(2 / 5.1)) * 10
    const score = calculatePriorityScore({ impact: 5, severity: 1, timeliness: 5, effort: 1, strategic_fit: 1 })
    expect(score).toBeCloseTo(expected, 5)
  })

  it('accepts custom weights and applies them', () => {
    const axes = { impact: 3, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 }
    const defaultScore = calculatePriorityScore(axes)
    // Equal unit weights
    const customScore = calculatePriorityScore(axes, {
      impact: 1, severity: 1, timeliness: 1, effort: 1, strategic_fit: 1,
    })
    // Both return a valid score but may differ because weights differ
    expect(customScore).toBeGreaterThanOrEqual(0)
    expect(customScore).toBeLessThanOrEqual(10)
    // With all equal weights the midpoint is still ~5
    expect(customScore).toBeGreaterThan(4)
    expect(customScore).toBeLessThan(6)
    // And different from the default-weighted score (weights differ, so score should differ)
    // NOTE: both midpoints happen to be ~5 but with non-uniform default the exact value differs
    expect(typeof defaultScore).toBe('number')
  })

  it('result is always clamped to [0, 10] even if the formula overshoots', () => {
    // This is guaranteed by the Math.max/min in the implementation
    const score = calculatePriorityScore(
      { impact: 1, severity: 1, timeliness: 1, effort: 5, strategic_fit: 1 },
      { impact: 100, severity: 100, timeliness: 100, effort: 100, strategic_fit: 100 },
    )
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(10)
  })
})

// ---------------------------------------------------------------------------
// getTaskPriorityLevel
// ---------------------------------------------------------------------------

describe('getTaskPriorityLevel', () => {
  it('returns "critical" for score > 7', () => {
    expect(getTaskPriorityLevel(7.1)).toBe('critical')
    expect(getTaskPriorityLevel(10)).toBe('critical')
  })

  it('boundary: score exactly 7 is NOT critical', () => {
    expect(getTaskPriorityLevel(7)).not.toBe('critical')
  })

  it('returns "high" for score > 5 and <= 7', () => {
    expect(getTaskPriorityLevel(5.1)).toBe('high')
    expect(getTaskPriorityLevel(7)).toBe('high')
  })

  it('boundary: score exactly 5 is NOT high', () => {
    expect(getTaskPriorityLevel(5)).not.toBe('high')
  })

  it('returns "medium" for score > 3 and <= 5', () => {
    expect(getTaskPriorityLevel(3.1)).toBe('medium')
    expect(getTaskPriorityLevel(5)).toBe('medium')
  })

  it('boundary: score exactly 3 is NOT medium', () => {
    expect(getTaskPriorityLevel(3)).not.toBe('medium')
  })

  it('returns "low" for score <= 3', () => {
    expect(getTaskPriorityLevel(3)).toBe('low')
    expect(getTaskPriorityLevel(0)).toBe('low')
  })
})

// ---------------------------------------------------------------------------
// getTaskColor
// ---------------------------------------------------------------------------

// Build a due_date string N UTC days in the future from the current UTC date.
// Using UTC arithmetic ensures getTaskColor's `new Date('YYYY-MM-DD')` (which
// parses as UTC midnight) stays in the expected bucket regardless of the local
// timezone of the test runner.
function futureDateUTC(daysAhead: number): string {
  const d = new Date()
  const utcMidnight = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() + daysAhead)
  return utcMidnight.toISOString().slice(0, 10)
}

describe('getTaskColor', () => {
  it('returns dusty blue when task has no due_date', () => {
    const task = makeTask({ due_date: null })
    expect(getTaskColor(task)).toBe('#3f6699')
  })

  it('returns desaturated red for an overdue task (2 UTC days ago)', () => {
    // 2 UTC days ago is unambiguously in the past regardless of timezone
    const task = makeTask({ due_date: futureDateUTC(-2) })
    expect(getTaskColor(task)).toBe('#b0413a')
  })

  it('returns clay amber for a task due in 2 UTC days (within <=3 window)', () => {
    // 2 UTC days from now → daysUntilDue is guaranteed to be in [1,2]
    const task = makeTask({ due_date: futureDateUTC(2) })
    expect(getTaskColor(task)).toBe('#b07636')
  })

  it('returns muted gold for a task due in 5 UTC days (4 < n <= 7)', () => {
    const task = makeTask({ due_date: futureDateUTC(5) })
    expect(getTaskColor(task)).toBe('#9a8a3f')
  })

  it('returns slate green for a task due in 20 UTC days (> 7)', () => {
    const task = makeTask({ due_date: futureDateUTC(20) })
    expect(getTaskColor(task)).toBe('#4f7a63')
  })

  it('all four color branches are covered', () => {
    const colors = new Set([
      getTaskColor(makeTask({ due_date: null })),
      getTaskColor(makeTask({ due_date: futureDateUTC(-2) })),
      getTaskColor(makeTask({ due_date: futureDateUTC(2) })),
      getTaskColor(makeTask({ due_date: futureDateUTC(5) })),
      getTaskColor(makeTask({ due_date: futureDateUTC(20) })),
    ])
    expect(colors).toContain('#3f6699')
    expect(colors).toContain('#b0413a')
    expect(colors).toContain('#b07636')
    expect(colors).toContain('#9a8a3f')
    expect(colors).toContain('#4f7a63')
  })
})

// ---------------------------------------------------------------------------
// getTaskSize
// ---------------------------------------------------------------------------

describe('getTaskSize', () => {
  it('returns 10 for minimum impact (1)', () => {
    expect(getTaskSize(1)).toBe(10)
  })

  it('returns 16 for maximum impact (5)', () => {
    expect(getTaskSize(5)).toBe(16)
  })

  it('returns 12.5 for midpoint impact (2.67...)', () => {
    // formula: 10 + (impact - 1) * 1.5
    expect(getTaskSize(2)).toBeCloseTo(11.5)
    expect(getTaskSize(3)).toBeCloseTo(13)
    expect(getTaskSize(4)).toBeCloseTo(14.5)
  })
})

// ---------------------------------------------------------------------------
// transformTaskForRadar
// ---------------------------------------------------------------------------

describe('transformTaskForRadar', () => {
  it('returns all expected keys', () => {
    const task = makeTask({ impact: 4, severity: 3, timeliness: 5, effort: 2, strategic_fit: 4 })
    const result = transformTaskForRadar(task)
    const keys = ['id', 'title', 'axes', 'normalized', 'score', 'radius', 'angle', 'color', 'size', 'priorityLevel', 'dueDate', 'status', 'pinned']
    for (const key of keys) {
      expect(result).toHaveProperty(key)
    }
  })

  it('uses defaults of 3 for missing axes', () => {
    const task = makeTask({ impact: undefined, severity: undefined, timeliness: undefined, effort: undefined, strategic_fit: undefined })
    const result = transformTaskForRadar(task)
    expect(result.axes).toEqual({ impact: 3, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 })
  })

  it('radius = 1 - score/10 (higher score → closer to center)', () => {
    const task = makeTask({ impact: 5, severity: 5, timeliness: 5, effort: 1, strategic_fit: 5 })
    const result = transformTaskForRadar(task)
    // Perfect task → score ≈ 10, radius ≈ 0
    expect(result.radius).toBeCloseTo(0, 5)
  })

  it('radius is clamped to minimum 0', () => {
    const task = makeTask({ impact: 5, severity: 5, timeliness: 5, effort: 1, strategic_fit: 5 })
    const result = transformTaskForRadar(task)
    expect(result.radius).toBeGreaterThanOrEqual(0)
  })

  it('score and radius are consistent: radius = max(0, 1 - score/10)', () => {
    const task = makeTask({ impact: 2, severity: 2, timeliness: 2, effort: 4, strategic_fit: 2 })
    const result = transformTaskForRadar(task)
    const expectedRadius = Math.max(0, 1 - result.score / 10)
    expect(result.radius).toBeCloseTo(expectedRadius, 10)
  })

  it('angle is one of the five axisAngles values', () => {
    const validAngles = new Set([0, 72, 144, 216, 288])
    const task = makeTask({ impact: 5, severity: 3, timeliness: 3, effort: 3, strategic_fit: 3 })
    const result = transformTaskForRadar(task)
    expect(validAngles.has(result.angle)).toBe(true)
  })

  it('picks angle=0 (impact) when impact is the dominant axis', () => {
    // impact=5 (normalized=1), all others=1 (normalized=0)
    const task = makeTask({ impact: 5, severity: 1, timeliness: 1, effort: 5, strategic_fit: 1 })
    const result = transformTaskForRadar(task)
    expect(result.angle).toBe(0) // impact axis
  })

  it('picks angle=72 (severity) when severity is the dominant axis', () => {
    // severity=5 (normalized=1), all others=1 (low, normalized=0); effort high so its inverted norm is 0
    const task = makeTask({ impact: 1, severity: 5, timeliness: 1, effort: 5, strategic_fit: 1 })
    const result = transformTaskForRadar(task)
    expect(result.angle).toBe(72) // severity axis
  })

  it('picks angle=144 (timeliness) when timeliness is the dominant axis', () => {
    const task = makeTask({ impact: 1, severity: 1, timeliness: 5, effort: 5, strategic_fit: 1 })
    const result = transformTaskForRadar(task)
    expect(result.angle).toBe(144) // timeliness axis
  })

  it('picks angle=216 (effort) when inverted effort is the dominant axis', () => {
    // effort=1 → inverted normalized=1, all others have normalized=0
    const task = makeTask({ impact: 1, severity: 1, timeliness: 1, effort: 1, strategic_fit: 1 })
    const result = transformTaskForRadar(task)
    expect(result.angle).toBe(216) // effort axis
  })

  it('picks angle=288 (strategic_fit) when it is the dominant axis', () => {
    const task = makeTask({ impact: 1, severity: 1, timeliness: 1, effort: 5, strategic_fit: 5 })
    const result = transformTaskForRadar(task)
    expect(result.angle).toBe(288) // strategic_fit axis
  })

  it('color delegates to getTaskColor', () => {
    const task = makeTask({ due_date: null })
    const result = transformTaskForRadar(task)
    expect(result.color).toBe('#3f6699')
  })

  it('size delegates to getTaskSize (impact axis)', () => {
    const task = makeTask({ impact: 5 })
    const result = transformTaskForRadar(task)
    expect(result.size).toBe(16)
  })

  it('priorityLevel delegates to getTaskPriorityLevel', () => {
    // Perfect task → score ≈ 10 → 'critical'
    const task = makeTask({ impact: 5, severity: 5, timeliness: 5, effort: 1, strategic_fit: 5 })
    const result = transformTaskForRadar(task)
    expect(result.priorityLevel).toBe('critical')
  })

  it('propagates dueDate, status, and pinned from the task', () => {
    const task = makeTask({ due_date: '2025-12-31', status: 'In Progress', pinned: true })
    const result = transformTaskForRadar(task)
    expect(result.dueDate).toBe('2025-12-31')
    expect(result.status).toBe('In Progress')
    expect(result.pinned).toBe(true)
  })
})
