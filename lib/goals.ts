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