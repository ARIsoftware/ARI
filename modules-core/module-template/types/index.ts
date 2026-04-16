/**
 * Module Template Module - Type Definitions
 *
 * This file contains TypeScript type definitions for the module.
 * It demonstrates:
 * - Database table types
 * - API response types
 * - Settings types
 * - Proper type exports
 *
 * IMPORTANT: Keep types in sync with:
 * - Database schema (database/schema.sql)
 * - API responses (api routes)
 * - Component props (components)
 */

/**
 * ModuleTemplateEntry
 *
 * Represents a row in the module_template_entries table
 * Maps directly to database schema
 */
export interface ModuleTemplateEntry {
  id: string              // UUID primary key
  user_id: string         // Foreign key to auth.users
  message: string         // Entry message content
  created_at: string      // ISO timestamp
  updated_at?: string     // Optional ISO timestamp
}

/**
 * CreateEntryRequest
 *
 * Request body for POST /api/modules/module-template/data
 */
export interface CreateEntryRequest {
  message: string
}

/**
 * GetEntriesResponse
 *
 * Response from GET /api/modules/module-template/data
 */
export interface GetEntriesResponse {
  entries: ModuleTemplateEntry[]
  count: number
}

/**
 * CreateEntryResponse
 *
 * Response from POST /api/modules/module-template/data
 */
export interface CreateEntryResponse {
  entry: ModuleTemplateEntry
}

/**
 * DeleteEntryResponse
 *
 * Response from DELETE /api/modules/module-template/data
 */
export interface DeleteEntryResponse {
  success: boolean
  message: string
}

/**
 * ModuleTemplateSettings
 *
 * Module settings stored in module_settings.settings (JSONB)
 * These are user-specific preferences for the module
 */
export interface ModuleTemplateSettings {
  // Onboarding fields (required before using module)
  // This demonstrates the onboarding pattern for modules that need initial setup
  onboardingCompleted: boolean
  sampleQuestion1: string
  sampleQuestion2: string
  sampleQuestion3: string

  // Feature toggles
  enableNotifications: boolean
  showInDashboard: boolean

  // Text settings
  defaultMessage: string
  userDisplayName: string

  // Dropdown settings
  theme: 'light' | 'dark' | 'auto'
  refreshInterval: '30' | '60' | '120'
}

/**
 * GetSettingsResponse
 *
 * Response from GET /api/modules/module-template/settings
 */
export type GetSettingsResponse = Partial<ModuleTemplateSettings>

/**
 * UpdateSettingsRequest
 *
 * Request body for PUT /api/modules/module-template/settings
 * Partial updates supported
 */
export type UpdateSettingsRequest = Partial<ModuleTemplateSettings>

/**
 * UpdateSettingsResponse
 *
 * Response from PUT /api/modules/module-template/settings
 */
export interface UpdateSettingsResponse {
  success: boolean
  message: string
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

/**
 * DEVELOPER NOTES:
 *
 * 1. Type Safety:
 *    - Export all types used in API and components
 *    - Keep types in sync with database schema
 *    - Use strict TypeScript settings
 *    - Avoid 'any' types
 *
 * 2. Database Types:
 *    - Match Supabase column types
 *    - Use string for UUIDs (not number)
 *    - Use string for timestamps (ISO format)
 *    - Optional fields marked with ?
 *
 * 3. API Types:
 *    - Separate request and response types
 *    - Use Partial<T> for partial updates
 *    - Include error response types
 *    - Document which endpoint uses which type
 *
 * 4. Settings Types:
 *    - Define complete settings interface
 *    - Use union types for enums
 *    - Make all fields optional in partial updates
 *    - Keep in sync with Zod schemas in API routes
 *
 * 5. Exporting:
 *    - Use named exports (not default)
 *    - Export all public types
 *    - Keep internal types private
 *    - Organize by category
 *
 * 6. Usage:
 *    - Import types in components:
 *      import { ModuleTemplateEntry } from '../types'
 *    - Import types in API routes:
 *      import type { CreateEntryRequest } from '../../types'
 *    - Import types in other modules:
 *      import type { ModuleTemplateEntry } from '@/modules/module-template/types'
 */
