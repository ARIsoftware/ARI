import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

const SettingsSchema = z.object({
  enabled: z.boolean().optional(),
  message: z.string().min(1, 'Message cannot be empty').max(200, 'Message must be 200 characters or less').optional(),
  countdownDuration: z.number().int('Duration must be a whole number').min(2, 'Duration must be between 2 and 30 minutes').max(30, 'Duration must be between 2 and 30 minutes').optional(),
  triggerMinute: z.number().int('Trigger minute must be a whole number').min(0, 'Trigger minute must be between 0 and 59').max(59, 'Trigger minute must be between 0 and 59').optional(),
  dismissable: z.boolean().optional(),
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'exercise-reminder'))
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(data[0]?.settings || {})
  } catch (error) {
    console.error('GET /api/modules/exercise-reminder/settings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        .where(eq(moduleSettings.moduleId, 'exercise-reminder'))
        .limit(1)
    )

    if (existing.length > 0) {
      const merged = { ...(existing[0].settings as Record<string, unknown>), ...parseResult.data }
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
            moduleId: 'exercise-reminder',
            settings: parseResult.data
          })
      )
    }

    return NextResponse.json({ success: true, message: 'Settings saved successfully' })
  } catch (error) {
    console.error('PUT /api/modules/exercise-reminder/settings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
