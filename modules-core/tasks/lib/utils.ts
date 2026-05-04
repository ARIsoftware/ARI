import { type Task } from "@/modules/tasks/types"
import { incrementTaskCompletion } from "@/lib/fitness-stats"

export type { Task }

export async function getTasks(): Promise<Task[]> {
  const response = await fetch('/api/modules/tasks')

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching tasks:", error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  return await response.json()
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "order_index">): Promise<Task> {
  const response = await fetch('/api/modules/tasks', {
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
  const response = await fetch('/api/modules/tasks', {
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
  const response = await fetch(`/api/modules/tasks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting task:", error)
    throw new Error(error.error || 'Failed to delete task')
  }
}

export async function toggleTaskCompletion(id: string): Promise<Task> {
  const response = await fetch('/api/modules/tasks')

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

  const updatedTask = await updateTask(id, {
    completed: newCompleted,
    status: newStatus,
  })

  if (newCompleted) {
    try {
      await incrementTaskCompletion(id)
    } catch (error) {
      console.error("Failed to increment completion count:", error)
    }
  }

  return updatedTask
}

export async function toggleTaskPin(id: string): Promise<Task> {
  const response = await fetch('/api/modules/tasks')

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
  })
}

export async function reorderTasks(taskIds: string[]): Promise<void> {
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  for (const update of updates) {
    const response = await fetch('/api/modules/tasks', {
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
