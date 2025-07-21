import { supabase, type Task } from "./supabase"

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from("ari-database").select("*").order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching tasks:", error)
    throw error
  }

  return data || []
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at">): Promise<Task> {
  const { data, error } = await supabase.from("ari-database").insert([task]).select().single()

  if (error) {
    console.error("Error creating task:", error)
    throw error
  }

  return data
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const { data, error } = await supabase
    .from("ari-database")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating task:", error)
    throw error
  }

  return data
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("ari-database").delete().eq("id", id)

  if (error) {
    console.error("Error deleting task:", error)
    throw error
  }
}

export async function toggleTaskCompletion(id: string): Promise<Task> {
  // First get the current task
  const { data: currentTask, error: fetchError } = await supabase
    .from("ari-database")
    .select("completed, status")
    .eq("id", id)
    .single()

  if (fetchError) {
    console.error("Error fetching task:", fetchError)
    throw fetchError
  }

  const newCompleted = !currentTask.completed
  const newStatus = newCompleted ? "Completed" : "Pending"

  return updateTask(id, {
    completed: newCompleted,
    status: newStatus,
  })
}

export async function toggleTaskStar(id: string): Promise<Task> {
  // First get the current task
  const { data: currentTask, error: fetchError } = await supabase
    .from("ari-database")
    .select("starred")
    .eq("id", id)
    .single()

  if (fetchError) {
    console.error("Error fetching task:", fetchError)
    throw fetchError
  }

  return updateTask(id, {
    starred: !currentTask.starred,
  })
}

export async function reorderTasks(taskIds: string[]): Promise<void> {
  // Update the created_at timestamps to reflect the new order
  const updates = taskIds.map((id, index) => ({
    id,
    created_at: new Date(Date.now() - (taskIds.length - index) * 1000).toISOString(),
  }))

  for (const update of updates) {
    await supabase.from("ari-database").update({ created_at: update.created_at }).eq("id", update.id)
  }
}
