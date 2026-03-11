import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { northstar } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// Validation schema for goal updates
const goalUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  progress: z.number().min(0).max(100).optional(),
  target_date: z.string().optional(),
}).strict()  // Reject unknown properties

// Validate UUID format
const uuidSchema = z.string().uuid('Invalid goal ID format')

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const goalId = params.id
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Validate goal ID is a valid UUID
    const idValidation = uuidSchema.safeParse(goalId)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'Invalid goal ID format' }, { status: 400 })
    }

    // Validate request body
    const bodyValidation = goalUpdateSchema.safeParse(body)
    if (!bodyValidation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: bodyValidation.error.errors },
        { status: 400 }
      )
    }

    // Map snake_case to camelCase and add updatedAt
    const updates = bodyValidation.data
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }
    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.progress !== undefined) updateData.progress = updates.progress

    // RLS automatically ensures user can only update their own goals
    const data = await withRLS((db) =>
      db.update(northstar)
        .set(updateData)
        .where(eq(northstar.id, goalId))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
