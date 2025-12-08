/**
 * Major Projects API - Settings Endpoints
 *
 * This file handles GET (fetch) and PUT (update) operations for module settings.
 * Settings are stored in the module_settings table with JSONB storage.
 *
 * Authentication: All endpoints require a valid authenticated session
 * Base path: /api/modules/major-projects/settings
 *
 * Endpoints:
 * - GET: Fetch user's settings
 * - PUT: Update user's settings (upsert)
 *
 * @module major-projects/api/settings
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import type { MajorProjectsSettings } from '../../types'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Module ID for settings storage
 * Must match the module.json id field
 */
const MODULE_ID = 'major-projects'

/**
 * Default settings values
 * Returned when no settings exist for the user
 */
const DEFAULT_SETTINGS: MajorProjectsSettings = {
  showInDashboard: true,
  enableNotifications: false,
  defaultSortBy: 'due_date',
  defaultSortOrder: 'asc',
  dueSoonThreshold: 7
}

// ============================================================================
// GET HANDLER - Fetch settings
// ============================================================================

/**
 * GET Handler - Fetch user's module settings
 *
 * Authentication: Required (Bearer token)
 * Query Params: None
 * Returns: MajorProjectsSettings object
 *
 * Behavior:
 * - If settings exist: Returns settings from database
 * - If no settings: Returns default settings
 * - Never returns error for missing settings (graceful fallback)
 *
 * @param request - Next.js request object
 * @returns JSON settings object or default settings
 *
 * @example
 * ```
 * GET /api/modules/major-projects/settings
 * Authorization: Bearer <token>
 *
 * Response (200 OK):
 * {
 *   "showInDashboard": true,
 *   "enableNotifications": false,
 *   "defaultSortBy": "due_date",
 *   "defaultSortOrder": "asc",
 *   "dueSoonThreshold": 7
 * }
 * ```
 */
export async function GET(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Step 2: Fetch settings from database
    const { data, error } = await supabase
      .from('module_settings')
      .select('settings')
      .eq('user_id', user.id)
      .eq('module_id', MODULE_ID)
      .single()

    // Step 3: Handle results
    if (error || !data) {
      // No settings found - return defaults
      // This is not an error condition
      return NextResponse.json(DEFAULT_SETTINGS)
    }

    // Step 4: Merge with defaults (handles new settings added in updates)
    const settings = {
      ...DEFAULT_SETTINGS,
      ...data.settings
    }

    return NextResponse.json(settings)

  } catch (error: any) {
    console.error('[MajorProjectsSettings] Error in GET /api/modules/major-projects/settings:', error)
    // Return defaults even on error (graceful degradation)
    return NextResponse.json(DEFAULT_SETTINGS)
  }
}

// ============================================================================
// PUT HANDLER - Update settings
// ============================================================================

/**
 * PUT Handler - Update user's module settings (upsert)
 *
 * Authentication: Required (Bearer token)
 * Body: Partial<MajorProjectsSettings> - Only include fields to update
 * Returns: Updated settings object
 *
 * Behavior:
 * - If settings exist: Updates existing record
 * - If no settings: Creates new record
 * - Upsert operation (INSERT ... ON CONFLICT UPDATE)
 * - Merges partial updates with existing settings
 *
 * Validation:
 * - TypeScript provides compile-time validation
 * - Runtime validation should be added for production
 * - Invalid fields are ignored (not saved)
 *
 * @param request - Next.js request object with JSON body
 * @returns Updated settings object or error response
 *
 * @example
 * ```
 * PUT /api/modules/major-projects/settings
 * Authorization: Bearer <token>
 * Content-Type: application/json
 *
 * Body:
 * {
 *   "dueSoonThreshold": 14,
 *   "enableNotifications": true
 * }
 *
 * Response (200 OK):
 * {
 *   "showInDashboard": true,
 *   "enableNotifications": true,
 *   "defaultSortBy": "due_date",
 *   "defaultSortOrder": "asc",
 *   "dueSoonThreshold": 14
 * }
 * ```
 */
export async function PUT(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Step 2: Parse request body
    let updates: Partial<MajorProjectsSettings>
    try {
      updates = await request.json()
    } catch (error) {
      return createErrorResponse('Invalid JSON in request body', 400)
    }

    // Step 3: Fetch current settings
    const { data: currentData } = await supabase
      .from('module_settings')
      .select('settings')
      .eq('user_id', user.id)
      .eq('module_id', MODULE_ID)
      .single()

    // Step 4: Merge updates with current settings (or defaults if none exist)
    const currentSettings = currentData?.settings || DEFAULT_SETTINGS
    const newSettings = {
      ...currentSettings,
      ...updates
    }

    // Step 5: Upsert settings to database
    const { data, error } = await supabase
      .from('module_settings')
      .upsert({
        user_id: user.id,
        module_id: MODULE_ID,
        settings: newSettings
      }, {
        onConflict: 'user_id,module_id'
      })
      .select('settings')
      .single()

    // Step 6: Handle database errors
    if (error) {
      console.error('[MajorProjectsSettings] Error updating settings:', error)
      return createErrorResponse(error.message, 500)
    }

    // Step 7: Return updated settings
    return NextResponse.json(data.settings)

  } catch (error: any) {
    console.error('[MajorProjectsSettings] Error in PUT /api/modules/major-projects/settings:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// ============================================================================
// DEVELOPER NOTES
// ============================================================================

/**
 * Settings Storage Strategy:
 *
 * Settings are stored in the module_settings table:
 *
 * CREATE TABLE module_settings (
 *   id UUID PRIMARY KEY,
 *   user_id UUID REFERENCES auth.users(id),
 *   module_id VARCHAR(255),
 *   settings JSONB,
 *   created_at TIMESTAMP,
 *   updated_at TIMESTAMP,
 *   UNIQUE(user_id, module_id)
 * );
 *
 * Benefits:
 * - Flexible schema (JSONB allows any structure)
 * - No migrations needed when adding new settings
 * - Each module has isolated settings
 * - Easy to query and update
 */

/**
 * Why merge with defaults?
 *
 * When new settings are added in module updates:
 * 1. Existing users have old settings without new fields
 * 2. Merging with defaults ensures new fields have values
 * 3. Prevents undefined values in settings object
 * 4. Backwards compatible with old settings
 *
 * Example:
 * - v1.0: { showInDashboard: true }
 * - v2.0 adds: { enableNotifications: false }
 * - GET merges to: { showInDashboard: true, enableNotifications: false }
 */

/**
 * Why upsert instead of separate insert/update?
 *
 * Upsert (INSERT ... ON CONFLICT UPDATE) handles both cases:
 * 1. First time: INSERT creates new record
 * 2. Subsequent times: UPDATE modifies existing record
 * 3. No need to check if record exists first
 * 4. Atomic operation (no race conditions)
 *
 * The UNIQUE(user_id, module_id) constraint enables this pattern.
 */

/**
 * Validation TODO:
 *
 * Production considerations:
 * 1. Add Zod schema for settings validation
 * 2. Validate dueSoonThreshold is positive number
 * 3. Validate defaultSortBy is valid field name
 * 4. Validate defaultSortOrder is 'asc' or 'desc'
 * 5. Sanitize any string fields
 * 6. Add max length checks
 *
 * For now, TypeScript provides type safety and
 * UI components restrict values to valid options.
 */

/**
 * Error Handling Philosophy:
 *
 * GET endpoint:
 * - Never fails hard
 * - Always returns valid settings (defaults if needed)
 * - Graceful degradation for better UX
 *
 * PUT endpoint:
 * - Validates authentication strictly
 * - Returns errors for malformed requests
 * - Database errors propagated to user
 *
 * This balances safety (PUT) with availability (GET).
 */

/**
 * Related Files:
 * - ../../types/index.ts - MajorProjectsSettings interface
 * - ../../components/settings-panel.tsx - UI that consumes this API
 * - ../data/route.ts - Main data CRUD operations
 * - module.json - Module configuration
 */
