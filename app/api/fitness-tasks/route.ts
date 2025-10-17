import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { createFitnessTaskSchema, updateFitnessTaskSchema } from '@/lib/validation'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    // Explicit user filtering for defense-in-depth (RLS also enforces this)
    const { data, error } = await supabase
      .from('fitness_database')
      .select('*')
      .eq('user_id', user.id)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('Error fetching fitness tasks:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Get the highest order_index for this user
    const { data: maxOrderData } = await supabase
      .from('fitness_database')
      .select('order_index')
      .eq('user_id', user.id)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0

    // Remove youtube_url if it's null or undefined to avoid database errors
    const taskToInsert = { ...task }
    if (taskToInsert.youtube_url === null || taskToInsert.youtube_url === undefined) {
      delete taskToInsert.youtube_url
    }

    const { data, error } = await supabase
      .from('fitness_database')
      .insert([{
        ...taskToInsert,
        order_index: nextOrderIndex,
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating fitness task:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Explicit user filtering - only update user's own tasks
    const { data, error } = await supabase
      .from('fitness_database')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating fitness task:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Explicit user filtering - only delete user's own tasks
    const { error } = await supabase
      .from('fitness_database')
      .delete()
      .eq('id', validatedId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting fitness task:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}