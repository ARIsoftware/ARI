/**
 * South Africa Module - Tasks API Routes
 *
 * Endpoints:
 * - GET    /api/modules/south-africa/tasks       - List all tasks
 * - POST   /api/modules/south-africa/tasks       - Create new task
 * - PATCH  /api/modules/south-africa/tasks?id=x  - Update task (toggle completed)
 * - DELETE /api/modules/south-africa/tasks?id=x  - Delete task
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { travel } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'

/**
 * Validation Schema for POST requests
 */
const CreateTaskSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title must be less than 500 characters'),
  category: z.enum(['todo', 'packing_list', 'morning_routine'])
})

/**
 * Validation Schema for PATCH requests
 */
const UpdateTaskSchema = z.object({
  completed: z.boolean().optional(),
  title: z.string().max(500).optional(),
  completed_at: z.string().nullable().optional()
})

/**
 * GET Handler - Fetch all tasks for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // RLS automatically filters by user_id
    const tasks = await withRLS((db) =>
      db.select().from(travel).orderBy(asc(travel.createdAt))
    )

    return NextResponse.json({
      tasks: toSnakeCase(tasks) || [],
      count: tasks?.length || 0
    })

  } catch (error) {
    console.error('GET /api/modules/south-africa/tasks error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create a new task
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parseResult = CreateTaskSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { title, category } = parseResult.data

    const data = await withRLS((db) =>
      db.insert(travel)
        .values({
          userId: user.id,
          title,
          category,
          completed: false
        })
        .returning()
    )

    return NextResponse.json(
      { task: toSnakeCase(data[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/south-africa/tasks error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH Handler - Update a task
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
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

    const body = await request.json()
    const parseResult = UpdateTaskSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const updates = parseResult.data

    // Build update object with camelCase keys
    const updateData: Record<string, unknown> = {}
    if (updates.completed !== undefined) updateData.completed = updates.completed
    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.completed_at !== undefined) updateData.completedAt = updates.completed_at

    // RLS automatically ensures user can only update their own tasks
    const data = await withRLS((db) =>
      db.update(travel)
        .set(updateData)
        .where(eq(travel.id, id))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ task: toSnakeCase(data[0]) })

  } catch (error) {
    console.error('PATCH /api/modules/south-africa/tasks error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete a task by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
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

    // RLS automatically ensures user can only delete their own tasks
    await withRLS((db) =>
      db.delete(travel).where(eq(travel.id, id))
    )

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/modules/south-africa/tasks error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
