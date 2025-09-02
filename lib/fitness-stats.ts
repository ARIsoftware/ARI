import { supabase } from "./supabase"

export interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

export async function getFitnessStats(getToken: () => Promise<string | null>): Promise<FitnessStats> {
  try {
    const token = await getToken()
    
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/fitness-stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    
    if (!response.ok) {
      const error = await response.json()
      console.error("Error fetching fitness stats:", error)
      throw new Error(error.error || 'Failed to fetch fitness stats')
    }

    const tasks = await response.json()

    if (!tasks || tasks.length === 0) {
      return {
        averageCompletionsPerDay: 0,
        mostCompletedTask: null,
        leastCompletedTask: null,
        totalCompletions: 0
      }
    }

    // Calculate total completions
    const totalCompletions = tasks.reduce((sum, task) => sum + (task.completion_count || 0), 0)

    // Find most and least completed tasks (only include tasks with completions > 0)
    const tasksWithCompletions = tasks.filter(task => (task.completion_count || 0) > 0)
    
    const mostCompletedTask = tasksWithCompletions.length > 0 
      ? { title: tasksWithCompletions[0].title, count: tasksWithCompletions[0].completion_count || 0 }
      : null

    const leastCompletedTask = tasksWithCompletions.length > 0
      ? { 
          title: tasksWithCompletions[tasksWithCompletions.length - 1].title, 
          count: tasksWithCompletions[tasksWithCompletions.length - 1].completion_count || 0 
        }
      : null

    // Calculate average completions per day
    // Get the earliest task creation date to calculate days since start
    const earliestTask = tasks.reduce((earliest, task) => {
      const taskDate = new Date(task.created_at)
      const earliestDate = new Date(earliest.created_at)
      return taskDate < earliestDate ? task : earliest
    }, tasks[0])

    const daysSinceStart = Math.max(1, Math.ceil((Date.now() - new Date(earliestTask.created_at).getTime()) / (1000 * 60 * 60 * 24)))
    const averageCompletionsPerDay = totalCompletions / daysSinceStart

    return {
      averageCompletionsPerDay,
      mostCompletedTask,
      leastCompletedTask,
      totalCompletions
    }
  } catch (error) {
    console.error("Failed to calculate fitness stats:", error)
    return {
      averageCompletionsPerDay: 0,
      mostCompletedTask: null,
      leastCompletedTask: null,
      totalCompletions: 0
    }
  }
}

// Function to increment completion count when a FITNESS task is completed
export async function incrementFitnessTaskCompletion(taskId: string, getToken: () => Promise<string | null>): Promise<void> {
  try {
    const token = await getToken()
    
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/fitness-tasks/increment-completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ taskId }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("Error incrementing fitness task completion:", error)
      throw new Error(error.error || 'Failed to increment fitness task completion')
    }
  } catch (error) {
    console.error("Failed to increment fitness task completion:", error)
    throw error
  }
}

// Keep the old function for regular tasks (ari-database)
export async function incrementTaskCompletion(taskId: string, getToken: () => Promise<string | null>): Promise<void> {
  try {
    const token = await getToken()
    
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/tasks/increment-completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ taskId }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("Error incrementing task completion:", error)
      throw new Error(error.error || 'Failed to increment task completion')
    }
  } catch (error) {
    console.error("Failed to increment task completion:", error)
    throw error
  }
}