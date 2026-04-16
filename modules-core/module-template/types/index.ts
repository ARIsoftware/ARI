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
  details?: unknown
}

/**
 * DEVELOPER NOTES:
 *
 * 1. Type Safety:
 *    - Export every type a consumer (component, hook, other module) reads.
 *    - Prefer `unknown` over `any` for loose payloads (e.g. `details?: unknown`);
 *      narrow with `typeof` / `instanceof` / Zod at the boundary.
 *    - In `catch (error)` blocks, type as `unknown` and use
 *      `error instanceof Error ? error.message : String(error)`.
 *    - Keep types in sync with the Drizzle schema in `database/schema.ts`.
 *
 * 2. Database Types:
 *    - Drizzle columns are camelCase in TS (`userId`) but snake_case in
 *      Postgres (`user_id`). `toSnakeCase()` in the API route converts
 *      the response, so the shapes declared here (e.g. `ModuleTemplateEntry`)
 *      should match what the frontend actually receives — snake_case.
 *    - Use `string` for UUIDs and ISO timestamps (Drizzle timestamp columns
 *      declare `mode: 'string'` to stay as strings end-to-end).
 *    - Mark nullable columns with `?` — do not use `| null` unless the
 *      API intentionally emits `null` instead of omitting the field.
 *
 * 3. API Types:
 *    - Separate request (`CreateEntryRequest`) and response
 *      (`CreateEntryResponse`) types; they're almost never the same shape.
 *    - Use `Partial<T>` for PATCH-style updates (see `UpdateSettingsRequest`).
 *    - Define a shared `ApiErrorResponse` — every route should return the
 *      same error envelope shape.
 *    - Comment which endpoint(s) each type maps to so grep can find consumers.
 *
 * 4. Settings Types:
 *    - One complete settings interface, all fields required at the type level.
 *    - Derive request/response shapes via `Partial<T>` — do not hand-write them.
 *    - Prefer string-literal unions (e.g. `'light' | 'dark' | 'auto'`) over
 *      `string` — this keeps the Zod schema in the API route and the TS
 *      type aligned.
 *    - Provide defaults in the settings panel (`DEFAULT_SETTINGS`) so the
 *      UI never renders undefined fields.
 *
 * 5. Exporting:
 *    - Named exports only — no default exports.
 *    - Export everything a hook, component, or other module might consume;
 *      keep helper/internal types un-exported to mark them as private.
 *
 * 6. Usage (where these imports live):
 *    - Component (1 level deep, e.g. `components/widget.tsx`):
 *      import type { ModuleTemplateEntry } from '../types'
 *    - Hook (1 level deep, e.g. `hooks/use-module-template.ts`):
 *      import type { ModuleTemplateEntry } from '../types'
 *    - API route (2 levels deep, e.g. `api/data/route.ts`) — only needed
 *      when returning typed shapes. The reference route in this template
 *      uses Zod + Drizzle directly and does not import from here.
 *      import type { GetEntriesResponse } from '../../types'
 *    - Another module:
 *      import type { ModuleTemplateEntry } from '@/modules/module-template/types'
 */
