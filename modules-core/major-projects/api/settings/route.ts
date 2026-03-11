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
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
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

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Fetch settings from database (RLS filters automatically)
    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1)
    )

    if (data.length === 0) {
      // No settings found - return defaults
      return NextResponse.json(DEFAULT_SETTINGS)
    }

    // Merge with defaults (handles new settings added in updates)
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(data[0].settings as object)
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

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Parse request body
    let updates: Partial<MajorProjectsSettings>
    try {
      updates = await request.json()
    } catch (error) {
      return createErrorResponse('Invalid JSON in request body', 400)
    }

    // Fetch current settings (RLS filters automatically)
    const currentData = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1)
    )

    // Merge updates with current settings (or defaults if none exist)
    const currentSettings = (currentData[0]?.settings as object) || DEFAULT_SETTINGS
    const newSettings = {
      ...currentSettings,
      ...updates
    }

    // Check if settings exist
    const existing = await withRLS((db) =>
      db.select({ id: moduleSettings.id })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1)
    )

    if (existing.length > 0) {
      // Update existing settings
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: newSettings,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(moduleSettings.id, existing[0].id))
      )
    } else {
      // Insert new settings
      await withRLS((db) =>
        db.insert(moduleSettings)
          .values({
            userId: user.id,
            moduleId: MODULE_ID,
            settings: newSettings
          })
      )
    }

    return NextResponse.json(newSettings)

  } catch (error: any) {
    console.error('[MajorProjectsSettings] Error in PUT /api/modules/major-projects/settings:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
