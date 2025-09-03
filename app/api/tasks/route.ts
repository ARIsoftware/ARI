import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { createTaskSchema, updateTaskSchema, uuidParamSchema } from '@/lib/validation'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // With RLS enabled, this will automatically filter by auth.uid()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('order_index', { ascending: true })
    
    if (error) {
      console.error('Error fetching tasks:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createTaskSchema)
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
      .from('tasks')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0

    // RLS will automatically set user_id to auth.uid()
    const { data, error } = await supabase
      .from('tasks')
      .insert([{
        ...task,
        order_index: nextOrderIndex,
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating task:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Validate request body
    const updateRequestSchema = z.object({
      id: z.string().uuid('Invalid task ID format'),
      updates: updateTaskSchema.shape.task
    })

    const validation = await validateRequestBody(request, updateRequestSchema)
    if (!validation.success) {
      return validation.response
    }

    const { id, updates } = validation.data
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS will ensure user can only update their own tasks
    const { data, error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating task:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Validate query parameters
    const deleteQuerySchema = z.object({
      id: z.string().uuid('Invalid task ID format')
    })

    const queryValidation = validateQueryParams(searchParams, deleteQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { id } = queryValidation.data
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS will ensure user can only delete their own tasks
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting task:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}