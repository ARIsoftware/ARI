export type Goal = {
  id: string
  title: string
  description: string
  category: string
  priority: "low" | "medium" | "high"
  deadline: string | null
  progress: number
  user_email: string
  created_at: string
  updated_at: string
}

export async function getGoals(): Promise<Goal[]> {
  const response = await fetch('/api/goals', {
    credentials: 'include',
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching goals:", error)
    throw new Error(error.error || 'Failed to fetch goals')
  }

  return await response.json()
}

export async function createGoal(goal: Omit<Goal, "id" | "created_at" | "updated_at" | "progress" | "user_email">): Promise<Goal> {
  const response = await fetch('/api/goals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ goal }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating goal:", error)
    throw new Error(error.error || 'Failed to create goal')
  }

  return await response.json()
}

export async function updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
  const response = await fetch(`/api/goals/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating goal:", error)
    throw new Error(error.error || 'Failed to update goal')
  }

  return await response.json()
}

export async function deleteGoal(id: string): Promise<void> {
  const response = await fetch(`/api/goals/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting goal:", error)
    throw new Error(error.error || 'Failed to delete goal')
  }
}

export async function updateGoalProgress(id: string, progress: number): Promise<Goal> {
  return updateGoal(id, { progress })
}