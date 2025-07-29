import { supabase, type FitnessTask } from "./supabase"

export type { FitnessTask }

export async function getFitnessTasks(): Promise<FitnessTask[]> {
  console.log("Attempting to fetch fitness tasks from fitness_database table...")
  
  // Check authentication status
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log("Current auth status:", { user: user?.email || 'Not authenticated', authError })
  
  const { data, error } = await supabase.from("fitness_database").select("*").order("order_index", { ascending: true })

  if (error) {
    console.error("Error fetching fitness tasks:", error)
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    })
    throw error
  }

  console.log("Successfully fetched fitness tasks:", data)
  return data || []
}

export async function createFitnessTask(task: Omit<FitnessTask, "id" | "created_at" | "updated_at" | "order_index">): Promise<FitnessTask> {
  console.log("Attempting to create fitness task:", task)
  
  // Get the highest order_index to place new task at the end
  const { data: maxOrderData, error: maxOrderError } = await supabase
    .from("fitness_database")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)

  if (maxOrderError) {
    console.error("Error getting max order index:", maxOrderError)
  }

  const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0
  console.log("Next order index:", nextOrderIndex)

  const taskToInsert = {
    ...task,
    order_index: nextOrderIndex,
  }
  console.log("Task to insert:", taskToInsert)

  const { data, error } = await supabase
    .from("fitness_database")
    .insert([taskToInsert])
    .select()
    .single()

  if (error) {
    console.error("Error creating fitness task:", error)
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    })
    throw error
  }

  console.log("Successfully created fitness task:", data)
  return data
}

export async function updateFitnessTask(id: string, updates: Partial<FitnessTask>): Promise<FitnessTask> {
  const { data, error } = await supabase
    .from("fitness_database")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating fitness task:", error)
    throw error
  }

  return data
}

export async function deleteFitnessTask(id: string): Promise<void> {
  const { error } = await supabase.from("fitness_database").delete().eq("id", id)

  if (error) {
    console.error("Error deleting fitness task:", error)
    throw error
  }
}

export async function toggleFitnessTaskCompletion(id: string): Promise<FitnessTask> {
  // First get the current task
  const { data: currentTask, error: fetchError } = await supabase
    .from("fitness_database")
    .select("completed, status")
    .eq("id", id)
    .single()

  if (fetchError) {
    console.error("Error fetching fitness task:", fetchError)
    throw fetchError
  }

  const newCompleted = !currentTask.completed
  const newStatus = newCompleted ? "Completed" : "Pending"

  return updateFitnessTask(id, {
    completed: newCompleted,
    status: newStatus,
  })
}

export async function toggleFitnessTaskStar(id: string): Promise<FitnessTask> {
  // First get the current task
  const { data: currentTask, error: fetchError } = await supabase
    .from("fitness_database")
    .select("starred")
    .eq("id", id)
    .single()

  if (fetchError) {
    console.error("Error fetching fitness task:", fetchError)
    throw fetchError
  }

  return updateFitnessTask(id, {
    starred: !currentTask.starred,
  })
}

export async function reorderFitnessTasks(taskIds: string[]): Promise<void> {
  // Update order_index for each task based on its position in the array
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  // Use a transaction to update all tasks atomically
  for (const update of updates) {
    const { error } = await supabase
      .from("fitness_database")
      .update({ order_index: update.order_index })
      .eq("id", update.id)

    if (error) {
      console.error("Error updating fitness task order:", error)
      throw error
    }
  }
}

// Add sample fitness tasks
export async function addSampleFitnessTasks(): Promise<void> {
  const sampleTasks = [
    {
      title: "100 pushups",
      assignees: ["Me"],
      due_date: new Date().toISOString().split('T')[0],
      subtasks_completed: 0,
      subtasks_total: 0,
      status: "Pending" as const,
      priority: "High" as const,
      starred: false,
      completed: false,
    },
    {
      title: "100 jumping jacks",
      assignees: ["Me"],
      due_date: new Date().toISOString().split('T')[0],
      subtasks_completed: 0,
      subtasks_total: 0,
      status: "Pending" as const,
      priority: "Medium" as const,
      starred: false,
      completed: false,
    },
    {
      title: "15 minute jog",
      assignees: ["Me"],
      due_date: new Date().toISOString().split('T')[0],
      subtasks_completed: 0,
      subtasks_total: 0,
      status: "Pending" as const,
      priority: "High" as const,
      starred: true,
      completed: false,
    },
  ]

  for (const task of sampleTasks) {
    try {
      await createFitnessTask(task)
    } catch (error) {
      console.error("Error adding sample fitness task:", error)
    }
  }
}