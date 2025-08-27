import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-auth-api'

const sampleFitnessTasks = [
  {
    title: "Morning Run - 5K",
    assignees: ["You"],
    due_date: new Date().toISOString().split('T')[0],
    subtasks_completed: 0,
    subtasks_total: 1,
    status: "Pending" as const,
    priority: "High" as const,
    starred: false,
    completed: false,
    youtube_url: "https://www.youtube.com/watch?v=9FGilxCbdz8",
  },
  {
    title: "Push-ups - 3 sets of 20",
    assignees: ["You"],
    due_date: new Date().toISOString().split('T')[0],
    subtasks_completed: 0,
    subtasks_total: 3,
    status: "Pending" as const,
    priority: "Medium" as const,
    starred: true,
    completed: false,
    youtube_url: "https://www.youtube.com/watch?v=IODxDxX7oi4",
  },
  {
    title: "Plank Hold - 60 seconds",
    assignees: ["You"],
    due_date: new Date().toISOString().split('T')[0],
    subtasks_completed: 0,
    subtasks_total: 1,
    status: "Pending" as const,
    priority: "Medium" as const,
    starred: false,
    completed: false,
  },
  {
    title: "Stretch Session - 15 minutes",
    assignees: ["You"],
    due_date: new Date().toISOString().split('T')[0],
    subtasks_completed: 0,
    subtasks_total: 1,
    status: "Pending" as const,
    priority: "Low" as const,
    starred: false,
    completed: false,
    youtube_url: "https://www.youtube.com/watch?v=g_tea8ZNk5A",
  }
]

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId } = await createAuthenticatedSupabaseClient()
    console.log('✅ User authenticated for POST:', userId)

    // Add sample tasks with proper order_index
    const tasksToInsert = sampleFitnessTasks.map((task, index) => ({
      ...task,
      order_index: index,
    }))

    const { data, error } = await supabase
      .from('fitness_database')
      .insert(tasksToInsert)
      .select()

    if (error) {
      console.error('Error adding sample fitness tasks:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    
    if (err instanceof Error && err.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}