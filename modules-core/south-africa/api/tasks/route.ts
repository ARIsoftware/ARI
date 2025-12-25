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
import { z } from 'zod'

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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { data: tasks, error: dbError } = await supabase
      .from('travel')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch tasks' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      tasks: tasks || [],
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    const { data: task, error: dbError } = await supabase
      .from('travel')
      .insert({
        user_id: user.id,
        title,
        category,
        completed: false
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { task },
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    const { data: task, error: dbError } = await supabase
      .from('travel')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to update task' },
        { status: 500 }
      )
    }

    return NextResponse.json({ task })

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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    const { error: dbError } = await supabase
      .from('travel')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to delete task' },
        { status: 500 }
      )
    }

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
