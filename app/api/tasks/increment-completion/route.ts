import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json()
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
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

    // Increment the completion count
    const newCount = (task?.completion_count || 0) + 1

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ 
        completion_count: newCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)

    if (updateError) {
      console.error('Error incrementing task completion:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, completion_count: newCount })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}