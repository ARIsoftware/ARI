/**
 * Documents Module - Settings API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/settings  - Get user's settings
 * - PUT /api/modules/documents/settings  - Update user's settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { DEFAULT_DOCUMENTS_SETTINGS } from '../../types'

const SettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  storageProvider: z.enum(['supabase', 'r2', 's3']).optional(),
  defaultView: z.enum(['cards', 'table']).optional(),
  maxFileSizeMb: z.number().min(1).max(2048).optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  supabase: z.object({
    bucketName: z.string().min(1),
  }).optional(),
  r2: z.object({
    bucketName: z.string().min(1),
  }).optional(),
  s3: z.object({
    bucketName: z.string().min(1),
    region: z.string().min(1),
  }).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'documents'))
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json(DEFAULT_DOCUMENTS_SETTINGS)
    }

    // Merge with defaults to ensure all fields exist
    return NextResponse.json({
      ...DEFAULT_DOCUMENTS_SETTINGS,
      ...(data[0]?.settings as object || {}),
    })

  } catch (error) {
    console.error('GET /api/modules/documents/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parseResult = SettingsSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const existing = await withRLS((db) =>
      db.select({ id: moduleSettings.id, settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'documents'))
        .limit(1)
    )

    // Merge new settings with existing ones
    const currentSettings = existing.length > 0 ? (existing[0].settings as object || {}) : {}
    const mergedSettings = { ...currentSettings, ...parseResult.data }

    if (existing.length > 0) {
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: mergedSettings,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(moduleSettings.id, existing[0].id))
      )
    } else {
      await withRLS((db) =>
        db.insert(moduleSettings)
          .values({
            userId: user.id,
            moduleId: 'documents',
            settings: mergedSettings
          })
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully'
    })

  } catch (error) {
    console.error('PUT /api/modules/documents/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
