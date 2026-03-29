import { Task } from "@/lib/supabase"

export type TaskAxes = {
  impact: number      // 1-5: Higher is better
  severity: number    // 1-5: Higher is more severe (better to address)
  timeliness: number  // 1-5: Higher is more urgent
  effort: number      // 1-5: Lower is better (less effort required)
  strategic_fit: number // 1-5: Higher is better
}

export type NormalizedAxes = {
  impact: number      // 0-1
  severity: number    // 0-1
  timeliness: number  // 0-1
  effort: number      // 0-1
  strategic_fit: number // 0-1
}

// Target values for each axis (ideal task profile)
// 1 = maximum desired, 0 = minimum desired
const TARGET_VALUES: NormalizedAxes = {
  impact: 1,        // Want high impact
  severity: 1,      // Want to address high severity issues
  timeliness: 1,    // Want to address urgent tasks
  effort: 1,        // Want low effort (already inverted in normalization)
  strategic_fit: 1  // Want high strategic alignment
}

// Default weights for each axis (can be customized later)
const DEFAULT_WEIGHTS = {
  impact: 1.2,      // Slightly more important
  severity: 1.0,
  timeliness: 1.1,  // Slightly more important
  effort: 0.8,      // Slightly less important
  strategic_fit: 1.0
}

// Maximum possible weighted Euclidean distance (when all normalized axes are at 0, target is 1)
// Each axis contributes weight * 1^2, so max = sqrt(sum of weights)
const MAX_DISTANCE = Math.sqrt(
  DEFAULT_WEIGHTS.impact +
  DEFAULT_WEIGHTS.severity +
  DEFAULT_WEIGHTS.timeliness +
  DEFAULT_WEIGHTS.effort +
  DEFAULT_WEIGHTS.strategic_fit
) // ≈ 2.2583

export function normalizeAxes(axes: TaskAxes): NormalizedAxes {
  return {
    impact: (axes.impact - 1) / 4,           // Convert 1-5 to 0-1
    severity: (axes.severity - 1) / 4,
    timeliness: (axes.timeliness - 1) / 4,
    effort: 1 - ((axes.effort - 1) / 4),     // Invert: low effort = high priority
    strategic_fit: (axes.strategic_fit - 1) / 4
  }
}

export function calculatePriorityScore(
  axes: TaskAxes,
  weights: typeof DEFAULT_WEIGHTS = DEFAULT_WEIGHTS
): number {
  const normalized = normalizeAxes(axes)

  // Calculate weighted Euclidean distance from target values
  const distance = Math.sqrt(
    weights.impact * Math.pow(normalized.impact - TARGET_VALUES.impact, 2) +
    weights.severity * Math.pow(normalized.severity - TARGET_VALUES.severity, 2) +
    weights.timeliness * Math.pow(normalized.timeliness - TARGET_VALUES.timeliness, 2) +
    weights.effort * Math.pow(normalized.effort - TARGET_VALUES.effort, 2) +
    weights.strategic_fit * Math.pow(normalized.strategic_fit - TARGET_VALUES.strategic_fit, 2)
  )

  // Normalize distance to 0-1 range, then invert so higher score = higher priority (0-10 scale)
  return Math.max(0, Math.min(10, (1 - distance / MAX_DISTANCE) * 10))
}

export function getTaskPriorityLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score > 7) return 'critical'
  if (score > 5) return 'high'
  if (score > 3) return 'medium'
  return 'low'
}

export function getTaskColor(task: Task): string {
  // Color based on due date urgency
  if (!task.due_date) return 'hsl(200, 70%, 50%)' // Blue for no due date

  const now = new Date()
  const dueDate = new Date(task.due_date)
  const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilDue < 0) return 'hsl(0, 70%, 50%)'     // Red for overdue
  if (daysUntilDue <= 3) return 'hsl(30, 70%, 50%)'   // Orange for due soon
  if (daysUntilDue <= 7) return 'hsl(60, 70%, 50%)'   // Yellow for due this week
  return 'hsl(120, 70%, 50%)'                          // Green for not urgent
}

export function getTaskSize(impact: number): number {
  // Size based on impact (1-5 scale)
  // Returns radius in pixels
  return 4 + (impact - 1) * 2 // 4px to 12px radius
}

// Transform task data for radar chart
export function transformTaskForRadar(task: Task) {
  const axes = {
    impact: task.impact || 3,
    severity: task.severity || 3,
    timeliness: task.timeliness || 3,
    effort: task.effort || 3,
    strategic_fit: task.strategic_fit || 3
  }

  const normalized = normalizeAxes(axes)
  // Always recalculate from axes to ensure consistent inverted scoring
  const score = calculatePriorityScore(axes)

  // Calculate position on radar chart
  // Convert score to radius (0 = center, 1 = edge)
  // Higher score = closer to center = higher priority
  const radius = Math.max(0, 1 - score / 10)

  // Angle based on primary axis (the one with highest normalized value)
  const primaryAxis = Object.entries(normalized).reduce((max, [key, value]) =>
    value > max.value ? { axis: key, value } : max,
    { axis: 'impact', value: 0 }
  )

  const axisAngles = {
    impact: 0,
    severity: 72,
    timeliness: 144,
    effort: 216,
    strategic_fit: 288
  }

  const angle = axisAngles[primaryAxis.axis as keyof typeof axisAngles]

  return {
    id: task.id,
    title: task.title,
    axes,
    normalized,
    score,
    radius,
    angle,
    color: getTaskColor(task),
    size: getTaskSize(axes.impact),
    priorityLevel: getTaskPriorityLevel(score),
    dueDate: task.due_date,
    status: task.status,
    pinned: task.pinned
  }
}
