export async function incrementTaskCompletion(taskId: string, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()

  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/modules/tasks/increment-completion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ taskId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to increment task completion')
  }
}
