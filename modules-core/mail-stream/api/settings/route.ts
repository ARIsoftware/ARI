/**
 * Mail Stream Module - Settings API Route
 *
 * Manages global settings for the mail stream module.
 * Requires authentication (any authenticated user can view/modify).
 *
 * Endpoints:
 * - GET /api/modules/mail-stream/settings - Get current settings
 * - PUT /api/modules/mail-stream/settings - Update settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { withAdminDb } from '@/lib/db'
import { mailStreamSettings, mailStreamEvents } from '@/lib/db/schema'
import { z } from 'zod'
import { lt } from 'drizzle-orm'

/**
 * Validation schema for settings
 */
const UpdateSettingsSchema = z.object({
  retention_days: z.number().refine(
    (val) => val === -1 || [7, 30, 90, 360].includes(val),
    { message: 'Invalid retention period' }
  ).optional(),
  setup_complete: z.boolean().optional()
})

/**
 * GET Handler - Fetch current settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Get settings (should be single row)
    const settings = await withAdminDb(async (db) => {
      return db
        .select()
        .from(mailStreamSettings)
        .limit(1)
    })

    if (settings.length === 0) {
      // Return defaults if no settings exist
      return NextResponse.json({
        settings: {
          retention_days: -1,
          setup_complete: false
        }
      })
    }

    return NextResponse.json({
      settings: toSnakeCase(settings[0])
    })

  } catch (error: any) {
    console.error('GET /api/modules/mail-stream/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT Handler - Update settings
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate body
    const body = await request.json()
    const parseResult = UpdateSettingsSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { retention_days, setup_complete } = parseResult.data

    await withAdminDb(async (db) => {
      // Check if settings exist
      const existingSettings = await db
        .select()
        .from(mailStreamSettings)
        .limit(1)

      // Build the values object with only provided fields
      const updateValues: Record<string, any> = {
        updatedAt: new Date().toISOString()
      }
      if (retention_days !== undefined) {
        updateValues.retentionDays = retention_days
      }
      if (setup_complete !== undefined) {
        updateValues.setupComplete = setup_complete
      }

      if (existingSettings.length === 0) {
        // Insert new settings with defaults
        await db.insert(mailStreamSettings).values({
          retentionDays: retention_days ?? -1,
          setupComplete: setup_complete ?? false
        })
      } else {
        // Update existing settings
        await db
          .update(mailStreamSettings)
          .set(updateValues)
      }

      // If retention is set and not indefinite, cleanup old events
      if (retention_days !== undefined && retention_days !== -1) {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - retention_days)

        await db
          .delete(mailStreamEvents)
          .where(lt(mailStreamEvents.createdAt, cutoffDate.toISOString()))
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully'
    })

  } catch (error: any) {
    console.error('PUT /api/modules/mail-stream/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
