import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get task creation data
    const { data: taskCreationData, error: creationError } = await supabase
      .from('tasks')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (creationError) {
      console.error('Error fetching task creation data:', creationError)
      return NextResponse.json({ error: 'Failed to fetch task creation data' }, { status: 500 })
    }

    // Get task completion data
    const { data: taskCompletionData, error: completionError } = await supabase
      .from('tasks')
      .select('updated_at, completed')
      .eq('user_id', user.id)
      .eq('completed', true)
      .gte('updated_at', startDate.toISOString())
      .lte('updated_at', endDate.toISOString())

    if (completionError) {
      console.error('Error fetching task completion data:', completionError)
      return NextResponse.json({ error: 'Failed to fetch task completion data' }, { status: 500 })
    }

    // Process data into daily counts
    const dailyData: Record<string, { date: string; tasksCreated: number; tasksCompleted: number }> = {}

    // Initialize all days in range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      dailyData[dateStr] = {
        date: dateStr,
        tasksCreated: 0,
        tasksCompleted: 0
      }
    }

    // Count task creations
    taskCreationData?.forEach(task => {
      const dateStr = new Date(task.created_at).toISOString().split('T')[0]
      if (dailyData[dateStr]) {
        dailyData[dateStr].tasksCreated++
      }
    })

    // Count task completions
    taskCompletionData?.forEach(task => {
      const dateStr = new Date(task.updated_at).toISOString().split('T')[0]
      if (dailyData[dateStr]) {
        dailyData[dateStr].tasksCompleted++
      }
    })

    // Convert to array and sort by date
    const analyticsData = Object.values(dailyData).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Calculate summary statistics
    const totalTasksCreated = analyticsData.reduce((sum, day) => sum + day.tasksCreated, 0)
    const totalTasksCompleted = analyticsData.reduce((sum, day) => sum + day.tasksCompleted, 0)
    const avgTasksCreatedPerDay = totalTasksCreated / days
    const avgTasksCompletedPerDay = totalTasksCompleted / days

    return NextResponse.json({
      success: true,
      data: analyticsData,
      summary: {
        totalTasksCreated,
        totalTasksCompleted,
        avgTasksCreatedPerDay: Math.round(avgTasksCreatedPerDay * 10) / 10,
        avgTasksCompletedPerDay: Math.round(avgTasksCompletedPerDay * 10) / 10,
        days
      }
    })

  } catch (error) {
    console.error('Error in task analytics API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}