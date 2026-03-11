/**
 * Quotes Module - Settings API Routes
 *
 * This file defines API endpoints for managing module settings.
 *
 * Endpoints:
 * - GET /api/modules/quotes/settings  - Get user's settings
 * - PUT /api/modules/quotes/settings  - Update user's settings
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
  showAuthor: z.boolean().optional(),
  cardsPerRow: z.number().min(1).max(4).optional(),
  defaultSortOrder: z.enum(['asc', 'desc']).optional()
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
        .where(eq(moduleSettings.moduleId, 'quotes'))
        .limit(1)
    )

    // If no settings found, return empty object (client will use defaults)
    if (data.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(data[0]?.settings || {})

  } catch (error) {
    console.error('GET /api/modules/quotes/settings error:', error)
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

    // Check if settings exist (RLS filters automatically)
    const existing = await withRLS((db) =>
      db.select({ id: moduleSettings.id })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'quotes'))
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
            moduleId: 'quotes',
            settings: parseResult.data
          })
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully'
    })

  } catch (error) {
    console.error('PUT /api/modules/quotes/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
