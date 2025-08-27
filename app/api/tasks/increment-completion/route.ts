import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-auth-api'

export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json()
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated for POST:', userId)

    // Get current completion count
    const { data: task, error: fetchError } = await supabase
      .from('ari-database')
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
      .from('ari-database')
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
    
    if (err instanceof Error && err.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}