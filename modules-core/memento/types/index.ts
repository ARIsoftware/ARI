/**
 * Memento Module - Type Definitions
 *
 * Types for the Life Grid visualization module.
 * Includes settings, milestones, and eras.
 */

/**
 * MementoSettings
 *
 * User-specific settings for the Memento module.
 * Stored in memento_settings table.
 */
export interface MementoSettings {
  id: string
  user_id: string
  birthdate: string          // ISO date string (YYYY-MM-DD)
  target_lifespan: number    // Target lifespan in years (default: 80)
  created_at: string
  updated_at: string
}

/**
 * MementoMilestone
 *
 * A milestone/memory attached to a specific week.
 * Stored in memento_milestones table.
 */
export interface MementoMilestone {
  id: string
  user_id: string
  week_number: number        // Week number from birth (0-indexed)
  title: string              // Required title
  description?: string       // Optional longer description
  category?: string          // Optional category (e.g., "Career", "Education")
  mood?: number              // Optional mood rating 1-5
  created_at: string
  updated_at: string
}

/**
 * MementoEra
 *
 * A life era that spans a date range with a color.
 * Used to color-code sections of the life grid.
 */
export interface MementoEra {
  id: string
  user_id: string
  name: string               // Era name (e.g., "University Years")
  start_date: string         // ISO date string (YYYY-MM-DD)
  end_date: string           // ISO date string (YYYY-MM-DD)
  color: string              // Hex color code (e.g., "#4f46e5")
  created_at: string
  updated_at: string
}

/**
 * WeekData
 *
 * Computed data for a single week in the grid.
 * Used for rendering the life grid visualization.
 */
export interface WeekData {
  weekNumber: number         // Week index from birth
  startDate: Date            // Start date of the week
  endDate: Date              // End date of the week
  isLived: boolean           // Has this week passed?
  isCurrent: boolean         // Is this the current week?
  milestone?: MementoMilestone  // Milestone for this week (if any)
  era?: MementoEra           // Era this week belongs to (if any)
}

/**
 * LifeStats
 *
 * Computed statistics for display.
 */
export interface LifeStats {
  weeksLived: number
  weeksRemaining: number
  totalWeeks: number
  percentageLived: number
  milestonesCount: number
  erasCount: number
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * CreateSettingsRequest
 */
export interface CreateSettingsRequest {
  birthdate: string
  target_lifespan?: number
}

/**
 * UpdateSettingsRequest
 */
export interface UpdateSettingsRequest {
  birthdate?: string
  target_lifespan?: number
}

/**
 * CreateMilestoneRequest
 */
export interface CreateMilestoneRequest {
  week_number: number
  title: string
  description?: string
  category?: string
  mood?: number
}

/**
 * UpdateMilestoneRequest
 */
export interface UpdateMilestoneRequest {
  title?: string
  description?: string
  category?: string
  mood?: number
}

/**
 * CreateEraRequest
 */
export interface CreateEraRequest {
  name: string
  start_date: string
  end_date: string
  color: string
}

/**
 * UpdateEraRequest
 */
export interface UpdateEraRequest {
  name?: string
  start_date?: string
  end_date?: string
  color?: string
}

/**
 * API Response Types
 */
export interface GetSettingsResponse {
  settings: MementoSettings | null
}

export interface GetMilestonesResponse {
  milestones: MementoMilestone[]
}

export interface GetErasResponse {
  eras: MementoEra[]
}

export interface ApiSuccessResponse {
  success: boolean
  message?: string
}

export interface ApiErrorResponse {
  error: string
  details?: any
}

/**
 * Category options for milestones
 */
export const MILESTONE_CATEGORIES = [
  'Career',
  'Education',
  'Relationship',
  'Travel',
  'Health',
  'Achievement',
  'Family',
  'Personal',
  'Other'
] as const

export type MilestoneCategory = typeof MILESTONE_CATEGORIES[number]

/**
 * Default era colors
 */
export const ERA_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
] as const
