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

    const data = await response.json()

    // The API now returns the stats object directly
    return {
      averageCompletionsPerDay: data.averageCompletionsPerDay || 0,
      mostCompletedTask: data.mostCompletedTask || null,
      leastCompletedTask: data.leastCompletedTask || null,
      totalCompletions: data.totalCompletions || 0
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