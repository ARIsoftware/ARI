import { supabase, type Task } from "./supabase"

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from("ari-database").select("*").order("order_index", { ascending: true })

  if (error) {
    console.error("Error fetching tasks:", error)
    throw error
  }

  return data || []
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at" | "order_index">): Promise<Task> {
  // Get the highest order_index to place new task at the end
  const { data: maxOrderData } = await supabase
    .from("ari-database")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)

  const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0

  const { data, error } = await supabase
    .from("ari-database")
    .insert([
      {
        ...task,
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
  // Update order_index for each task based on its position in the array
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  // Use a transaction to update all tasks atomically
  for (const update of updates) {
    const { error } = await supabase
      .from("ari-database")
      .update({ order_index: update.order_index })
      .eq("id", update.id)

    if (error) {
      console.error("Error updating task order:", error)
      throw error
    }
  }
}
