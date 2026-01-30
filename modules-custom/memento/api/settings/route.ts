/**
 * Memento Module - Settings API
 *
 * Endpoints:
 * - GET  /api/modules/memento/settings  - Get user settings
 * - POST /api/modules/memento/settings  - Create/update settings (upsert)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { mementoSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Validation schemas
const SettingsSchema = z.object({
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birthdate must be YYYY-MM-DD format'),
  target_lifespan: z.number().min(50).max(120).optional().default(80)
})

/**
 * GET - Fetch user's memento settings
 */
export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const settings = await withRLS((db) =>
      db.select()
        .from(mementoSettings)
        .where(eq(mementoSettings.userId, user.id))
        .limit(1)
    )

    return NextResponse.json({
      settings: settings.length > 0 ? toSnakeCase(settings[0]) : null
    })

  } catch (error) {
    console.error('GET /api/modules/memento/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST - Create or update user's memento settings (upsert)
 */
export async function POST(request: NextRequest) {
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

    const { birthdate, target_lifespan } = parseResult.data

    // Check if settings already exist for this user
    const existing = await withRLS((db) =>
      db.select()
        .from(mementoSettings)
        .where(eq(mementoSettings.userId, user.id))
        .limit(1)
    )

    let result
    if (existing.length > 0) {
      // Update existing settings
      result = await withRLS((db) =>
        db.update(mementoSettings)
          .set({
            birthdate,
            targetLifespan: target_lifespan,
            updatedAt: new Date().toISOString()
          })
          .where(eq(mementoSettings.userId, user.id))
          .returning()
      )
    } else {
      // Insert new settings
      result = await withRLS((db) =>
        db.insert(mementoSettings)
          .values({
            userId: user.id,
            birthdate,
            targetLifespan: target_lifespan
          })
          .returning()
      )
    }

    return NextResponse.json({
      settings: toSnakeCase(result[0])
    })

  } catch (error) {
    console.error('POST /api/modules/memento/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
