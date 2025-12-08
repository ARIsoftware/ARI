/**
 * Ohtani Module - Type Definitions
 *
 * This file contains TypeScript type definitions for the Ohtani module.
 */

/**
 * OhtaniGridCell
 *
 * Represents a row in the ohtani_grid_cells table
 * Maps directly to database schema
 */
export interface OhtaniGridCell {
  id: string              // UUID primary key
  user_id: string         // Foreign key to auth.users
  row_index: number       // Grid row (0-8)
  col_index: number       // Grid column (0-8)
  content: string         // Cell content (max 15 chars)
  created_at: string      // ISO timestamp
  updated_at?: string     // Optional ISO timestamp
}

/**
 * UpdateCellRequest
 *
 * Request body for PUT /api/modules/ohtani/data
 */
export interface UpdateCellRequest {
  row_index: number
  col_index: number
  content: string
}

/**
 * GetGridResponse
 *
 * Response from GET /api/modules/ohtani/data
 */
export interface GetGridResponse {
  cells: OhtaniGridCell[]
}

/**
 * UpdateCellResponse
 *
 * Response from PUT /api/modules/ohtani/data
 */
export interface UpdateCellResponse {
  cell: OhtaniGridCell
}

/**
 * API Error Response
 *
 * Standard error response format for all module APIs
 */
export interface ApiErrorResponse {
  error: string
  details?: any
}
