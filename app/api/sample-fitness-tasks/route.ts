import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseSecretKey)

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
    const { userId } = await request.json()
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Add sample tasks with proper order_index
    const tasksToInsert = sampleFitnessTasks.map((task, index) => ({
      ...task,
      user_id: userId,
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}