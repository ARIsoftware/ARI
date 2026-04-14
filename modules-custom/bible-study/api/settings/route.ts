import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

const KidSchema = z.object({
  name: z.string().min(1, 'Kid name is required').max(100, 'Name must be 100 characters or fewer'),
  age: z.number().int().min(0, 'Age must be 0 or greater').max(18, 'Age must be 18 or less'),
})

const SettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  kids: z.array(KidSchema).max(10, 'Maximum 10 kids allowed').optional(),
  preferredTranslations: z.array(z.string()).optional(),
  openrouterApiKey: z.string().max(500, 'API key must be 500 characters or fewer').optional(),
  openrouterModel: z.string().max(200, 'Model name must be 200 characters or fewer').optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'bible-study'))
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(data[0]?.settings || {})
  } catch (error) {
    console.error('GET /api/modules/bible-study/settings error:', error instanceof Error ? error.message : error)
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
        .where(eq(moduleSettings.moduleId, 'bible-study'))
        .limit(1)
    )

    if (existing.length > 0) {
      const merged = { ...(existing[0].settings as Record<string, unknown>), ...validation.data }
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
            moduleId: 'bible-study',
            settings: validation.data
          })
      )
    }

    return NextResponse.json({ success: true, message: 'Settings saved successfully' })
  } catch (error) {
    console.error('PUT /api/modules/bible-study/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
