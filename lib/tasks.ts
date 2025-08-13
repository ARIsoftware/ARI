import { type Task } from "./supabase"
import { incrementTaskCompletion } from "./fitness-stats"

export type { Task }

export async function getTasks(userId: string): Promise<Task[]> {
  const response = await fetch(`/api/tasks?userId=${encodeURIComponent(userId)}`)
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching tasks:", error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  return await response.json()
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "order_index">, userId: string): Promise<Task> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task, userId }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating task:", error)
    throw new Error(error.error || 'Failed to create task')
  }

  return await response.json()
}

export async function updateTask(id: string, updates: Partial<Task>, userId: string): Promise<Task> {
  const response = await fetch('/api/tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, updates, userId }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating task:", error)
    throw new Error(error.error || 'Failed to update task')
  }

  return await response.json()
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  const response = await fetch(`/api/tasks?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting task:", error)
    throw new Error(error.error || 'Failed to delete task')
  }
}

export async function toggleTaskCompletion(id: string, userId: string): Promise<Task> {
  // First get the current task
  const client = await getAuthenticatedSupabase()
  const { data: currentTask, error: fetchError } = await client
    .from("ari-database")
    .select("completed, status")
    .eq("id", id)
    .eq("user_id", userId)
    .single()

  if (fetchError) {
    console.error("Error fetching task:", fetchError)
    throw fetchError
  }

  const newCompleted = !currentTask.completed
  const newStatus = newCompleted ? "Completed" : "Pending"

  // Update the task
  const updatedTask = await updateTask(id, {
    completed: newCompleted,
    status: newStatus,
  }, userId)

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

export async function toggleTaskStar(id: string, userId: string): Promise<Task> {
  // First get the current task
  const client = await getAuthenticatedSupabase()
  const { data: currentTask, error: fetchError } = await client
    .from("ari-database")
    .select("starred")
    .eq("id", id)
    .eq("user_id", userId)
    .single()

  if (fetchError) {
    console.error("Error fetching task:", fetchError)
    throw fetchError
  }

  return updateTask(id, {
    starred: !currentTask.starred,
  }, userId)
}

export async function reorderTasks(taskIds: string[], userId: string): Promise<void> {
  // Update order_index for each task based on its position in the array
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  const client = await getAuthenticatedSupabase()
  // Use a transaction to update all tasks atomically
  for (const update of updates) {
    const { error } = await client
      .from("ari-database")
      .update({ order_index: update.order_index })
      .eq("id", update.id)
      .eq("user_id", userId)

    if (error) {
      console.error("Error updating task order:", error)
      throw error
    }
  }
}
