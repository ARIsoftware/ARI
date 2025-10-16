import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: Request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "")
    
    // Create Supabase client with the user's token
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Get fitness task completion data
    const { data: completions, error: completionsError } = await supabase
      .from('fitness_database')
      .select('*')
      .eq('user_id', user.id)

    if (completionsError) {
      console.error("Error fetching completions:", completionsError)
      return NextResponse.json({ 
        averageCompletionsPerDay: 0,
        mostCompletedTask: null,
        leastCompletedTask: null,
        totalCompletions: 0
      })
    }

    // Calculate statistics
    const taskCompletions: { [key: string]: number } = {}
    let totalCompletions = 0

    completions?.forEach((completion) => {
      const taskTitle = completion.task_title
      if (taskTitle) {
        taskCompletions[taskTitle] = (taskCompletions[taskTitle] || 0) + 1
        totalCompletions++
      }
    })

    // Calculate days range
    const dates = completions?.map(c => new Date(c.completed_at)) || []
    const uniqueDays = new Set(dates.map(d => d.toDateString()))
    const daysWithData = uniqueDays.size || 1

    // Find most and least completed tasks
    const sortedTasks = Object.entries(taskCompletions).sort((a, b) => b[1] - a[1])
    const mostCompletedTask = sortedTasks[0] 
      ? { title: sortedTasks[0][0], count: sortedTasks[0][1] } 
      : null
    const leastCompletedTask = sortedTasks[sortedTasks.length - 1]
      ? { title: sortedTasks[sortedTasks.length - 1][0], count: sortedTasks[sortedTasks.length - 1][1] }
      : null

    return NextResponse.json({
      averageCompletionsPerDay: totalCompletions / daysWithData,
      mostCompletedTask,
      leastCompletedTask,
      totalCompletions
    })
    
  } catch (error) {
    console.error("Error in fitness-stats API:", error)
    return NextResponse.json({ 
      averageCompletionsPerDay: 0,
      mostCompletedTask: null,
      leastCompletedTask: null,
      totalCompletions: 0
    })
  }
}