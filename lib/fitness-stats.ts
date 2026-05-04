export async function incrementTaskCompletion(taskId: string): Promise<void> {
  const response = await fetch('/api/modules/tasks/increment-completion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to increment task completion')
  }
}
