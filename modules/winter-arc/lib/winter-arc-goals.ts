export type WinterArcGoal = {
  id: string
  user_id: string
  title: string
  completed: boolean
  created_at: string
  updated_at: string
}

export async function getWinterArcGoals(): Promise<WinterArcGoal[]> {
  const response = await fetch('/api/modules/winter-arc', {
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching winter arc goals:", error)
    throw new Error(error.error || 'Failed to fetch winter arc goals')
  }

  return await response.json()
}

export async function createWinterArcGoal(title: string): Promise<WinterArcGoal> {
  const response = await fetch('/api/modules/winter-arc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ title }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating winter arc goal:", error)
    throw new Error(error.error || 'Failed to create winter arc goal')
  }

  return await response.json()
}

export async function toggleWinterArcGoal(id: string, completed: boolean): Promise<WinterArcGoal> {
  const response = await fetch(`/api/modules/winter-arc/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ completed }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error toggling winter arc goal:", error)
    throw new Error(error.error || 'Failed to toggle winter arc goal')
  }

  return await response.json()
}

export async function deleteWinterArcGoal(id: string): Promise<void> {
  const response = await fetch(`/api/modules/winter-arc/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting winter arc goal:", error)
    throw new Error(error.error || 'Failed to delete winter arc goal')
  }
}
