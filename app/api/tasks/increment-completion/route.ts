import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseSecretKey)

export async function POST(request: NextRequest) {
  try {
    const { taskId, userId } = await request.json()
    
    if (!taskId || !userId) {
      return NextResponse.json({ error: 'Task ID and User ID are required' }, { status: 400 })
    }

    // Get current completion count
    const { data: task, error: fetchError } = await supabase
      .from('ari-database')
      .select('completion_count')
      .eq('id', taskId)
      .contains('user_ids', [userId])
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
      .contains('user_ids', [userId])

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