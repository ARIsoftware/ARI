export async function getLastCompletedTask(getToken: () => Promise<string | null>, userId?: string) {
  try {
    const token = await getToken()

    if (!token) {
      console.error("Authentication required for getLastCompletedTask")
      return null
    }

    const url = userId
      ? `/api/modules/tasks/last-completed?userId=${encodeURIComponent(userId)}`
      : '/api/modules/tasks/last-completed'

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("Error fetching last completed task:", error)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("Error in getLastCompletedTask:", error)
    return null
  }
}

export function truncateTaskName(taskName: string, maxLength: number = 50): string {
  if (taskName.length <= maxLength) return taskName
  return taskName.substring(0, maxLength) + "..."
}
