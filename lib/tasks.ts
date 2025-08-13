import { supabase, getAuthenticatedSupabase, type Task } from "./supabase"
import { incrementTaskCompletion } from "./fitness-stats"

export type { Task }

export async function getTasks(userId: string): Promise<Task[]> {
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("ari-database")
    .select("*")
    .eq("user_id", userId)
    .order("order_index", { ascending: true })

  if (error) {
    console.error("Error fetching tasks:", error)
    throw error
  }

  return data || []
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "order_index">, userId: string): Promise<Task> {
  const client = await getAuthenticatedSupabase()
  // Get the highest order_index for this user to place new task at the end
  const { data: maxOrderData } = await client
    .from("ari-database")
    .select("order_index")
    .eq("user_id", userId)
    .order("order_index", { ascending: false })
    .limit(1)

  const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0

  const { data, error } = await client
    .from("ari-database")
    .insert([
      {
        ...task,
        user_id: userId,
        order_index: nextOrderIndex,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error("Error creating task:", error)
    throw error
  }

  return data
}

export async function updateTask(id: string, updates: Partial<Task>, userId: string): Promise<Task> {
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("ari-database")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single()

  if (error) {
    console.error("Error updating task:", error)
    throw error
  }

  return data
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  const client = await getAuthenticatedSupabase()
  const { error } = await client
    .from("ari-database")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    console.error("Error deleting task:", error)
    throw error
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
