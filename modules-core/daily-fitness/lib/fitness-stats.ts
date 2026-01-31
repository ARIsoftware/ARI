export interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

export async function getFitnessStats(): Promise<FitnessStats> {
  try {
    const response = await fetch('/api/modules/daily-fitness/stats', {
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("Error fetching fitness stats:", error)
      throw new Error(error.error || 'Failed to fetch fitness stats')
    }

    const data = await response.json()

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

export async function incrementFitnessTaskCompletion(taskId: string): Promise<void> {
  try {
    const response = await fetch('/api/modules/daily-fitness/increment-completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
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
