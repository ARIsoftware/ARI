import { type Task } from "./supabase"
import { incrementTaskCompletion } from "./fitness-stats"

export type { Task }

export async function getTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks')
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching tasks:", error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  return await response.json()
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "order_index">): Promise<Task> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating task:", error)
    throw new Error(error.error || 'Failed to create task')
  }

  return await response.json()
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const response = await fetch('/api/tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, updates }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating task:", error)
    throw new Error(error.error || 'Failed to update task')
  }

  return await response.json()
}

export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting task:", error)
    throw new Error(error.error || 'Failed to delete task')
  }
}

export async function toggleTaskCompletion(id: string): Promise<Task> {
  // First get the current task state
  const response = await fetch('/api/tasks')
  
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
  })

  // If the task is being marked as completed, increment completion count
  if (newCompleted) {
    try {
      await incrementTaskCompletion(id)
    } catch (error) {
      console.error("Failed to increment completion count:", error)
      // Don't throw here - the task update was successful, completion count increment is secondary
    }
  }

  return updatedTask
}

export async function toggleTaskStar(id: string): Promise<Task> {
  // First get the current task state
  const response = await fetch('/api/tasks')
  
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
    starred: !currentTask.starred,
  })
}

export async function reorderTasks(taskIds: string[]): Promise<void> {
  // Update order_index for each task based on its position in the array
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  // Update each task's order using the API
  for (const update of updates) {
    const response = await fetch('/api/tasks', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        id: update.id, 
        updates: { order_index: update.order_index }
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("Error updating task order:", error)
      throw new Error(error.error || 'Failed to update task order')
    }
  }
}
