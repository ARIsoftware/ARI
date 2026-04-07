import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

const SettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
}).strict()

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'music-player'))
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(data[0]?.settings || {})
  } catch (error) {
    console.error('GET /api/modules/music-player/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

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
      db.select({ id: moduleSettings.id, settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'music-player'))
        .limit(1)
    )

    if (existing.length > 0) {
      const merged = SettingsSchema.parse({
        ...(existing[0].settings as Record<string, unknown> || {}),
        ...validation.data,
      })
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: merged,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(moduleSettings.id, existing[0].id))
      )
    } else {
      await withRLS((db) =>
        db.insert(moduleSettings)
          .values({
            userId: user.id,
            moduleId: 'music-player',
            settings: validation.data
          })
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/modules/music-player/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
