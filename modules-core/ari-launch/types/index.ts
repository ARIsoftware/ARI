/**
 * ARI Launch Module - Type Definitions (v2)
 *
 * Type definitions for the 45-day launch planning calendar.
 * Supports multiple tasks per day with drag-and-drop.
 */

/**
 * AriLaunchEntry
 *
 * Represents a single task in the launch calendar.
 * Multiple tasks can exist per day.
 */
export interface AriLaunchEntry {
  id: string              // UUID primary key
  user_id: string         // Foreign key to auth.users
  day_number: number      // Day 1-45
  title: string           // Task title
  order_index: number     // Order within the day
  created_at: string      // ISO timestamp
  updated_at: string      // ISO timestamp
}

/**
 * CreateEntryRequest
 *
 * Request body for POST /api/modules/ari-launch/data
 */
export interface CreateEntryRequest {
  day_number: number
  title: string
}

/**
 * UpdateEntryRequest
 *
 * Request body for PATCH /api/modules/ari-launch/data
 */
export interface UpdateEntryRequest {
  id: string
  day_number?: number     // For drag-and-drop to new day
  title?: string          // For editing title
  order_index?: number    // For reordering within day
}

/**
 * GetEntriesResponse
 *
 * Response from GET /api/modules/ari-launch/data
 */
export interface GetEntriesResponse {
  entries: AriLaunchEntry[]
  count: number
}

/**
 * CreateEntryResponse
 *
 * Response from POST /api/modules/ari-launch/data
 */
export interface CreateEntryResponse {
  entry: AriLaunchEntry
}

/**
 * UpdateEntryResponse
 *
 * Response from PATCH /api/modules/ari-launch/data
 */
export interface UpdateEntryResponse {
  entry: AriLaunchEntry
}

/**
 * DeleteEntryResponse
 *
 * Response from DELETE /api/modules/ari-launch/data
 */
export interface DeleteEntryResponse {
  success: boolean
}

/**
 * API Error Response
 *
 * Standard error response format
 */
export interface ApiErrorResponse {
  error: string
  details?: any
}
