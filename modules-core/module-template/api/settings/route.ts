/**
 * Module Template Module - Settings API Routes
 *
 * This file defines API endpoints for managing module settings.
 * It demonstrates:
 * - Settings persistence in module_settings table
 * - JSONB column usage for flexible settings
 * - GET and PUT patterns for settings
 *
 * Endpoints:
 * - GET /api/modules/module-template/settings  - Get user's settings
 * - PUT /api/modules/module-template/settings  - Update user's settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * Settings Schema
 * Validates the structure of settings being saved
 */
const SettingsSchema = z.object({
  // Onboarding fields (demonstrates setup screen pattern)
  onboardingCompleted: z.boolean().optional(),
  sampleQuestion1: z.string().max(500, 'Answer must be 500 characters or fewer').optional(),
  sampleQuestion2: z.string().max(500, 'Answer must be 500 characters or fewer').optional(),
  sampleQuestion3: z.string().max(500, 'Answer must be 500 characters or fewer').optional(),
  // Feature toggles
  enableNotifications: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),
  defaultMessage: z.string().max(500, 'Default message must be 500 characters or fewer').optional(),
  userDisplayName: z.string().max(100, 'Display name must be 100 characters or fewer').optional(),
  theme: z.enum(['light', 'dark', 'auto'], {
    errorMap: () => ({ message: 'Theme must be one of: light, dark, auto' }),
  }).optional(),
  refreshInterval: z.enum(['30', '60', '120'], {
    errorMap: () => ({ message: 'Refresh interval must be one of: 30, 60, 120 (seconds)' }),
  }).optional(),
})

/**
 * GET Handler - Fetch user's settings
 *
 * Authentication: Required
 * Returns: Settings object or empty object if no settings saved
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch settings from module_settings table (RLS filters automatically)
    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'module-template'))
        .limit(1)
    )

    // If no settings found, return empty object (client will use defaults)
    if (data.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(data[0]?.settings || {})

  } catch (error) {
    console.error('GET /api/modules/module-template/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

/**
 * PUT Handler - Update user's settings
 *
 * Authentication: Required
 * Body: Settings object (partial updates supported)
 * Returns: { success: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, SettingsSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const existing = await withRLS((db) =>
      db.select({ id: moduleSettings.id })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'module-template'))
        .limit(1)
    )

    if (existing.length > 0) {
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: validation.data,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(moduleSettings.id, existing[0].id))
      )
    } else {
      await withRLS((db) =>
        db.insert(moduleSettings)
          .values({
            userId: user.id,
            moduleId: 'module-template',
            settings: validation.data
          })
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully'
    })

  } catch (error) {
    console.error('PUT /api/modules/module-template/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
