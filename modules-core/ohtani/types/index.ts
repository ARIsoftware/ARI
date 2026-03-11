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
  user_id?: string        // Foreign key (snake_case, legacy)
  userId?: string         // Foreign key (camelCase, Drizzle)
  row_index?: number      // Grid row (snake_case, legacy)
  rowIndex?: number       // Grid row (camelCase, Drizzle)
  col_index?: number      // Grid column (snake_case, legacy)
  colIndex?: number       // Grid column (camelCase, Drizzle)
  content: string         // Cell content (max 15 chars)
  created_at?: string     // ISO timestamp (snake_case)
  createdAt?: string      // ISO timestamp (camelCase)
  updated_at?: string     // Optional ISO timestamp (snake_case)
  updatedAt?: string      // Optional ISO timestamp (camelCase)
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
