/**
 * Memento Module - Eras API
 *
 * Endpoints:
 * - GET    /api/modules/memento/eras         - Get all eras
 * - POST   /api/modules/memento/eras         - Create new era
 * - PATCH  /api/modules/memento/eras         - Update era
 * - DELETE /api/modules/memento/eras?id=x    - Delete era
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { mementoEras } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { z } from 'zod'

// Validation schemas
const CreateEraSchema = z.object({
  name: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD format'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex code')
})

const UpdateEraSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
})

/**
 * GET - Fetch all eras for the user
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

    const eras = await withRLS((db) =>
      db.select()
        .from(mementoEras)
        .where(eq(mementoEras.userId, user.id))
        .orderBy(asc(mementoEras.startDate))
    )

    return NextResponse.json({
      eras: toSnakeCase(eras) || []
    })

  } catch (error) {
    console.error('GET /api/modules/memento/eras error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST - Create a new era
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
    const parseResult = CreateEraSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { name, start_date, end_date, color } = parseResult.data

    // Validate end_date is after start_date
    if (new Date(end_date) < new Date(start_date)) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      )
    }

    const result = await withRLS((db) =>
      db.insert(mementoEras)
        .values({
          userId: user.id,
          name,
          startDate: start_date,
          endDate: end_date,
          color
        })
        .returning()
    )

    return NextResponse.json(
      { era: toSnakeCase(result[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/memento/eras error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Update an existing era
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parseResult = UpdateEraSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { id, ...updates } = parseResult.data

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString()
    }
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.start_date !== undefined) updateData.startDate = updates.start_date
    if (updates.end_date !== undefined) updateData.endDate = updates.end_date
    if (updates.color !== undefined) updateData.color = updates.color

    const result = await withRLS((db) =>
      db.update(mementoEras)
        .set(updateData)
        .where(and(
          eq(mementoEras.id, id),
          eq(mementoEras.userId, user.id)
        ))
        .returning()
    )

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Era not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ era: toSnakeCase(result[0]) })

  } catch (error) {
    console.error('PATCH /api/modules/memento/eras error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Delete an era
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    await withRLS((db) =>
      db.delete(mementoEras)
        .where(and(
          eq(mementoEras.id, id),
          eq(mementoEras.userId, user.id)
        ))
    )

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('DELETE /api/modules/memento/eras error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
