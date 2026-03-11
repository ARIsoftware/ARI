/**
 * Hello World Module - Settings API Routes
 *
 * This file defines API endpoints for managing module settings.
 * It demonstrates:
 * - Settings persistence in module_settings table
 * - JSONB column usage for flexible settings
 * - GET and PUT patterns for settings
 *
 * Endpoints:
 * - GET /api/modules/hello-world/settings  - Get user's settings
 * - PUT /api/modules/hello-world/settings  - Update user's settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

/**
 * Settings Schema
 * Validates the structure of settings being saved
 */
const SettingsSchema = z.object({
  // Onboarding fields (demonstrates setup screen pattern)
  onboardingCompleted: z.boolean().optional(),
  sampleQuestion1: z.string().optional(),
  sampleQuestion2: z.string().optional(),
  sampleQuestion3: z.string().optional(),
  // Feature toggles
  enableNotifications: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),
  defaultMessage: z.string().optional(),
  userDisplayName: z.string().optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  refreshInterval: z.enum(['30', '60', '120']).optional()
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
        .where(eq(moduleSettings.moduleId, 'hello-world'))
        .limit(1)
    )

    // If no settings found, return empty object (client will use defaults)
    if (data.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(data[0]?.settings || {})

  } catch (error) {
    console.error('GET /api/modules/hello-world/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate body
    const body = await request.json()
    const parseResult = SettingsSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    // Check if settings exist for this module (RLS filters automatically)
    const existing = await withRLS((db) =>
      db.select({ id: moduleSettings.id })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'hello-world'))
        .limit(1)
    )

    if (existing.length > 0) {
      // Update existing settings
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: parseResult.data,
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
            moduleId: 'hello-world',
            settings: parseResult.data
          })
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully'
    })

  } catch (error) {
    console.error('PUT /api/modules/hello-world/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
