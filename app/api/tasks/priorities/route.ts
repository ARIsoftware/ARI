import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { calculatePriorityScore } from '@/lib/priority-utils'
import { z } from 'zod'

const updatePrioritiesSchema = z.object({
  taskId: z.string().uuid(),
  axes: z.object({
    impact: z.number().min(1).max(5),
    severity: z.number().min(1).max(5),
    timeliness: z.number().min(1).max(5),
    effort: z.number().min(1).max(5),
    strategic_fit: z.number().min(1).max(5)
  })
})

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch all tasks with priority axes
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('priority_score', { ascending: true }) // Lower score = higher priority
    
    if (error) {
      console.error('Error fetching task priorities:', error)
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
    const body = await request.json()
    const validation = updatePrioritiesSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Invalid request data', 
        details: validation.error.errors 
      }, { status: 400 })
    }

    const { taskId, axes } = validation.data
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Calculate priority score
    const priorityScore = calculatePriorityScore(axes)

    // Update task with new axes and calculated score
    const { data, error } = await supabase
      .from('tasks')
      .update({
        impact: axes.impact,
        severity: axes.severity,
        timeliness: axes.timeliness,
        effort: axes.effort,
        strategic_fit: axes.strategic_fit,
        priority_score: priorityScore,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select()
      .single()

    if (error) {
      console.error('Error updating task priorities:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Batch update multiple tasks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskIds } = body
    
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'Invalid task IDs' }, { status: 400 })
    }

    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Recalculate priority scores for all specified tasks
    const updates = []
    for (const taskId of taskIds) {
      // Fetch current task data
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('impact, severity, timeliness, effort, strategic_fit')
        .eq('id', taskId)
        .single()
      
      if (fetchError || !task) continue
      
      const axes = {
        impact: task.impact || 3,
        severity: task.severity || 3,
        timeliness: task.timeliness || 3,
        effort: task.effort || 3,
        strategic_fit: task.strategic_fit || 3
      }
      
      const priorityScore = calculatePriorityScore(axes)
      
      // Update task with new score
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          priority_score: priorityScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)
      
      if (!updateError) {
        updates.push({ taskId, priorityScore })
      }
    }

    return NextResponse.json({ updated: updates.length, tasks: updates })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}