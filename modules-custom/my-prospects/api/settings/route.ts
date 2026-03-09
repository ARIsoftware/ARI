import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

const SettingsSchema = z.object({
  showInDashboard: z.boolean().optional(),
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
        .where(eq(moduleSettings.moduleId, 'my-prospects'))
        .limit(1)
    )

    if (data.length === 0) return NextResponse.json({})
    return NextResponse.json(data[0]?.settings || {})
  } catch (error) {
    console.error('GET /api/modules/my-prospects/settings error:', error)
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
      db.select({ id: moduleSettings.id })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'my-prospects'))
        .limit(1)
    )

    if (existing.length > 0) {
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({ settings: parseResult.data, updatedAt: sql`timezone('utc'::text, now())` })
          .where(eq(moduleSettings.id, existing[0].id))
      )
    } else {
      await withRLS((db) =>
        db.insert(moduleSettings).values({
          userId: user.id,
          moduleId: 'my-prospects',
          settings: parseResult.data,
        })
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/modules/my-prospects/settings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
