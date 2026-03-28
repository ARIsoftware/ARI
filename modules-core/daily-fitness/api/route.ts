import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { createFitnessTaskSchema, updateFitnessTaskSchema } from '@/lib/validation'
import { z } from 'zod'
import { fitnessDatabase } from '@/lib/db/schema'
import { eq, asc, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const data = await withRLS((db) =>
      db.select().from(fitnessDatabase).where(eq(fitnessDatabase.userId, user.id)).orderBy(asc(fitnessDatabase.orderIndex))
    )

    return NextResponse.json(toSnakeCase(data) || [])
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createFitnessTaskSchema)
    if (!validation.success) {
      return validation.response
    }

    const { task } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Get the highest order_index for this user
    const maxOrderData = await withRLS((db) =>
      db.select({ orderIndex: fitnessDatabase.orderIndex })
        .from(fitnessDatabase)
        .where(eq(fitnessDatabase.userId, user.id))
        .orderBy(desc(fitnessDatabase.orderIndex))
        .limit(1)
    )

    const nextOrderIndex = maxOrderData.length > 0 ? (maxOrderData[0].orderIndex || 0) + 1 : 0

    // INSERT requires explicit user_id - RLS validates it
    const data = await withRLS((db) =>
      db.insert(fitnessDatabase).values({
        title: task.title,
        assignees: task.assignees,
        dueDate: task.due_date,
        subtasksCompleted: task.subtasks_completed,
        subtasksTotal: task.subtasks_total,
        status: task.status,
        priority: task.priority,
        pinned: task.pinned,
        completed: task.completed,
        orderIndex: nextOrderIndex,
        youtubeUrl: task.youtube_url || undefined,
        userId: user.id,
      }).returning()
    )

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, updateFitnessTaskSchema)
    if (!validation.success) {
      return validation.response
    }

    const { id, updates } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Build update object with camelCase keys
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }
    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.assignees !== undefined) updateData.assignees = updates.assignees
    if (updates.due_date !== undefined) updateData.dueDate = updates.due_date
    if (updates.subtasks_completed !== undefined) updateData.subtasksCompleted = updates.subtasks_completed
    if (updates.subtasks_total !== undefined) updateData.subtasksTotal = updates.subtasks_total
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.priority !== undefined) updateData.priority = updates.priority
    if (updates.pinned !== undefined) updateData.pinned = updates.pinned
    if (updates.completed !== undefined) updateData.completed = updates.completed
    if (updates.order_index !== undefined) updateData.orderIndex = updates.order_index
    if (updates.youtube_url !== undefined) updateData.youtubeUrl = updates.youtube_url
    if (updates.completion_count !== undefined) updateData.completionCount = updates.completion_count

    // RLS automatically ensures user can only update their own tasks
    const data = await withRLS((db) =>
      db.update(fitnessDatabase)
        .set(updateData)
        .where(eq(fitnessDatabase.id, id))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Validate query parameters
    const deleteQuerySchema = z.object({
      id: z.string().uuid('Invalid task ID format')
    })

    const id = searchParams.get('id')
    const queryValidation = deleteQuerySchema.safeParse({ id })

    if (!queryValidation.success) {
      return createErrorResponse('Task ID is required and must be a valid UUID', 400)
    }

    const validatedId = queryValidation.data.id
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically ensures user can only delete their own tasks
    await withRLS((db) =>
      db.delete(fitnessDatabase).where(eq(fitnessDatabase.id, validatedId))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
