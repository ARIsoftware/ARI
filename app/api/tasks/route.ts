import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { createTaskSchema, updateTaskSchema, uuidParamSchema } from '@/lib/validation'
import { calculatePriorityScore } from '@/lib/priority-utils'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Explicit user filtering for defense-in-depth (RLS also enforces this)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
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
      .eq('user_id', user.id)
      .order('order_index', { ascending: false })
      .limit(1)

    const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0

    // Calculate priority score if axes are provided
    let priorityScore = undefined
    if (task.impact || task.severity || task.timeliness || task.effort || task.strategic_fit) {
      const axes = {
        impact: task.impact || 3,
        severity: task.severity || 3,
        timeliness: task.timeliness || 3,
        effort: task.effort || 3,
        strategic_fit: task.strategic_fit || 3
      }
      priorityScore = calculatePriorityScore(axes)
    }

    // Explicitly set user_id since we use service role client (bypasses RLS)
    const { data, error } = await supabase
      .from('tasks')
      .insert([{
        ...task,
        user_id: user.id,
        order_index: nextOrderIndex,
        priority_score: priorityScore
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

    // Calculate priority score if axes are being updated
    let priorityScore = updates.priority_score
    if (updates.impact !== undefined || updates.severity !== undefined || 
        updates.timeliness !== undefined || updates.effort !== undefined || 
        updates.strategic_fit !== undefined) {
      
      // Fetch current task to get existing axes values (explicit user filter)
      const { data: currentTask } = await supabase
        .from('tasks')
        .select('impact, severity, timeliness, effort, strategic_fit')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      
      if (currentTask) {
        const axes = {
          impact: updates.impact ?? currentTask.impact ?? 3,
          severity: updates.severity ?? currentTask.severity ?? 3,
          timeliness: updates.timeliness ?? currentTask.timeliness ?? 3,
          effort: updates.effort ?? currentTask.effort ?? 3,
          strategic_fit: updates.strategic_fit ?? currentTask.strategic_fit ?? 3
        }
        priorityScore = calculatePriorityScore(axes)
      }
    }

    // Explicit user filtering - only update user's own tasks
    const { data, error } = await supabase
      .from('tasks')
      .update({
        ...updates,
        priority_score: priorityScore,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
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

    // Explicit user filtering - only delete user's own tasks
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

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