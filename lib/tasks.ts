import { type Task } from "./supabase"
import { incrementTaskCompletion } from "./fitness-stats"

// Helper function to create authenticated fetch requests
async function authenticatedFetch(url: string, options: RequestInit = {}, getToken: () => Promise<string | null>) {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  })
}

export type { Task }

export async function getTasks(getToken?: () => Promise<string | null>): Promise<Task[]> {
  if (!getToken) {
    throw new Error('Authentication token provider required')
  }
  
  const response = await authenticatedFetch('/api/tasks', {}, getToken)
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching tasks:", error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  return await response.json()
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "order_index">, getToken: () => Promise<string | null>): Promise<Task> {
  const response = await authenticatedFetch('/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task }),
  }, getToken)

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating task:", error)
    throw new Error(error.error || 'Failed to create task')
  }

  return await response.json()
}

export async function updateTask(id: string, updates: Partial<Task>, getToken: () => Promise<string | null>): Promise<Task> {
  const response = await authenticatedFetch('/api/tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, updates }),
  }, getToken)

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating task:", error)
    throw new Error(error.error || 'Failed to update task')
  }

  return await response.json()
}

export async function deleteTask(id: string, getToken: () => Promise<string | null>): Promise<void> {
  const response = await authenticatedFetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, getToken)

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting task:", error)
    throw new Error(error.error || 'Failed to delete task')
  }
}

export async function toggleTaskCompletion(id: string, getToken: () => Promise<string | null>): Promise<Task> {
  // First get the current task state
  const response = await authenticatedFetch('/api/tasks', {}, getToken)
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching tasks:", error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  const tasks = await response.json()
  const currentTask = tasks.find((t: Task) => t.id === id)
  
  if (!currentTask) {
    throw new Error('Task not found')
  }

  const newCompleted = !currentTask.completed
  const newStatus = newCompleted ? "Completed" : "Pending"

  // Update the task
  const updatedTask = await updateTask(id, {
    completed: newCompleted,
    status: newStatus,
  }, getToken)

  // If the task is being marked as completed, increment completion count
  if (newCompleted) {
    try {
      await incrementTaskCompletion(id, getToken)
    } catch (error) {
      console.error("Failed to increment completion count:", error)
      // Don't throw here - the task update was successful, completion count increment is secondary
    }
  }

  return updatedTask
}

export async function toggleTaskPin(id: string, getToken: () => Promise<string | null>): Promise<Task> {
  // First get the current task state
  const response = await authenticatedFetch('/api/tasks', {}, getToken)

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching tasks:", error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  const tasks = await response.json()
  const currentTask = tasks.find((t: Task) => t.id === id)

  if (!currentTask) {
    throw new Error('Task not found')
  }

  return updateTask(id, {
    pinned: !currentTask.pinned,
  }, getToken)
}

export async function reorderTasks(taskIds: string[], getToken: () => Promise<string | null>): Promise<void> {
  // Update order_index for each task based on its position in the array
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  // Update each task's order using the API
  for (const update of updates) {
    const response = await authenticatedFetch('/api/tasks', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        id: update.id, 
        updates: { order_index: update.order_index }
      }),
    }, getToken)

    if (!response.ok) {
      const error = await response.json()
      console.error("Error updating task order:", error)
      throw new Error(error.error || 'Failed to update task order')
    }
  }
}
