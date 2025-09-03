import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'

const incrementCompletionSchema = z.object({
  taskId: z.string().uuid('Invalid task ID format'),
  increment: z.number().int().min(1, 'Increment must be at least 1').max(10, 'Increment too large').default(1)
})

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, incrementCompletionSchema)
    if (!validation.success) {
      return validation.response
    }

    const { taskId, increment } = validation.data
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Get current completion count
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('completion_count')
      .eq('id', taskId)
      .single()

    if (fetchError) {
      console.error('Error fetching task for completion increment:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Increment the completion count with validation
    const currentCount = task?.completion_count || 0
    const newCount = currentCount + increment
    
    // Prevent excessive completion counts
    if (newCount > 10000) {
      return createErrorResponse('Completion count too high', 400)
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ 
        completion_count: newCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)

    if (updateError) {
      console.error('Error incrementing task completion:', updateError)
      return createErrorResponse(updateError.message, 500)
    }

    return NextResponse.json({ success: true, completion_count: newCount })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}