/**
 * Memento Module - Milestones API
 *
 * Endpoints:
 * - GET    /api/modules/memento/milestones         - Get all milestones
 * - POST   /api/modules/memento/milestones         - Create a new milestone
 * - PATCH  /api/modules/memento/milestones         - Update a milestone
 * - DELETE /api/modules/memento/milestones?id=x    - Delete milestone
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { mementoMilestones } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { z } from 'zod'

// Validation schemas
const CreateMilestoneSchema = z.object({
  week_number: z.number().min(0),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  mood: z.number().min(1).max(5).optional()
})

const UpdateMilestoneSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  mood: z.number().min(1).max(5).optional().nullable()
})

/**
 * GET - Fetch all milestones for the user
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

    const milestones = await withRLS((db) =>
      db.select()
        .from(mementoMilestones)
        .where(eq(mementoMilestones.userId, user.id))
        .orderBy(asc(mementoMilestones.weekNumber))
    )

    return NextResponse.json({
      milestones: toSnakeCase(milestones) || []
    })

  } catch (error) {
    console.error('GET /api/modules/memento/milestones error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST - Create a new milestone
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
    const parseResult = CreateMilestoneSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { week_number, title, description, category, mood } = parseResult.data

    const result = await withRLS((db) =>
      db.insert(mementoMilestones)
        .values({
          userId: user.id,
          weekNumber: week_number,
          title,
          description: description || null,
          category: category || null,
          mood: mood || null
        })
        .returning()
    )

    return NextResponse.json(
      { milestone: toSnakeCase(result[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/memento/milestones error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Update an existing milestone
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
    const parseResult = UpdateMilestoneSchema.safeParse(body)

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
    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.mood !== undefined) updateData.mood = updates.mood

    const result = await withRLS((db) =>
      db.update(mementoMilestones)
        .set(updateData)
        .where(and(
          eq(mementoMilestones.id, id),
          eq(mementoMilestones.userId, user.id)
        ))
        .returning()
    )

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Milestone not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ milestone: toSnakeCase(result[0]) })

  } catch (error) {
    console.error('PATCH /api/modules/memento/milestones error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Delete a milestone
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
      db.delete(mementoMilestones)
        .where(and(
          eq(mementoMilestones.id, id),
          eq(mementoMilestones.userId, user.id)
        ))
    )

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('DELETE /api/modules/memento/milestones error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
