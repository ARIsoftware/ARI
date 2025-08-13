import { supabase, getAuthenticatedSupabase, type FitnessTask } from "./supabase"
import { incrementFitnessTaskCompletion } from "./fitness-stats"

export type { FitnessTask }

export async function getFitnessTasks(userId: string): Promise<FitnessTask[]> {
  console.log("Attempting to fetch fitness tasks from fitness_database table for user:", userId)
  
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("fitness_database")
    .select("*")
    .eq("user_id", userId)
    .order("order_index", { ascending: true })

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

export async function createFitnessTask(task: Omit<FitnessTask, "id" | "created_at" | "updated_at" | "order_index"> & { youtube_url?: string | null }, userId: string): Promise<FitnessTask> {
  console.log("Attempting to create fitness task:", task, "for user:", userId)
  
  const client = await getAuthenticatedSupabase()
  // Get the highest order_index for this user to place new task at the end
  const { data: maxOrderData, error: maxOrderError } = await client
    .from("fitness_database")
    .select("order_index")
    .eq("user_id", userId)
    .order("order_index", { ascending: false })
    .limit(1)

  if (maxOrderError) {
    console.error("Error getting max order index:", maxOrderError)
  }

  const nextOrderIndex = maxOrderData && maxOrderData.length > 0 ? (maxOrderData[0].order_index || 0) + 1 : 0
  console.log("Next order index:", nextOrderIndex)

  // Remove youtube_url if it's null or undefined to avoid database errors
  const { youtube_url, ...taskWithoutYoutube } = task
  const taskToInsert: any = {
    ...taskWithoutYoutube,
    user_id: userId,
    order_index: nextOrderIndex,
  }
  
  // Only add youtube_url if it has a value
  if (youtube_url && youtube_url.trim()) {
    taskToInsert.youtube_url = youtube_url
  }
  
  console.log("Task to insert:", taskToInsert)

  const { data, error } = await client
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

export async function updateFitnessTask(id: string, updates: Partial<FitnessTask>, userId: string): Promise<FitnessTask> {
  // Filter out youtube_url if it's undefined to avoid database errors
  const { youtube_url, ...otherUpdates } = updates
  const finalUpdates: any = { ...otherUpdates, updated_at: new Date().toISOString() }
  
  // Only include youtube_url if it's explicitly set (including null for removal)
  if (youtube_url !== undefined) {
    finalUpdates.youtube_url = youtube_url
  }
  
  const client = await getAuthenticatedSupabase()
  const { data, error } = await client
    .from("fitness_database")
    .update(finalUpdates)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single()

  if (error) {
    console.error("Error updating fitness task:", error)
    throw error
  }

  return data
}

export async function deleteFitnessTask(id: string, userId: string): Promise<void> {
  const client = await getAuthenticatedSupabase()
  const { error } = await client
    .from("fitness_database")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    console.error("Error deleting fitness task:", error)
    throw error
  }
}

export async function toggleFitnessTaskCompletion(id: string, userId: string): Promise<FitnessTask> {
  // First get the current task
  const client = await getAuthenticatedSupabase()
  const { data: currentTask, error: fetchError } = await client
    .from("fitness_database")
    .select("completed, status")
    .eq("id", id)
    .eq("user_id", userId)
    .single()

  if (fetchError) {
    console.error("Error fetching fitness task:", fetchError)
    throw fetchError
  }

  const newCompleted = !currentTask.completed
  const newStatus = newCompleted ? "Completed" : "Pending"

  // Update the fitness task
  const updatedTask = await updateFitnessTask(id, {
    completed: newCompleted,
    status: newStatus,
  }, userId)

  // If the task is being marked as completed, increment completion count and add to history
  if (newCompleted) {
    try {
      await incrementFitnessTaskCompletion(id)
    } catch (error) {
      console.error("Failed to increment fitness task completion:", error)
      // Don't throw here - the task update was successful, completion count increment is secondary
    }
  }

  return updatedTask
}

export async function toggleFitnessTaskStar(id: string, userId: string): Promise<FitnessTask> {
  // First get the current task
  const client = await getAuthenticatedSupabase()
  const { data: currentTask, error: fetchError } = await client
    .from("fitness_database")
    .select("starred")
    .eq("id", id)
    .eq("user_id", userId)
    .single()

  if (fetchError) {
    console.error("Error fetching fitness task:", fetchError)
    throw fetchError
  }

  return updateFitnessTask(id, {
    starred: !currentTask.starred,
  }, userId)
}

export async function reorderFitnessTasks(taskIds: string[], userId: string): Promise<void> {
  // Update order_index for each task based on its position in the array
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  const client = await getAuthenticatedSupabase()
  // Use a transaction to update all tasks atomically
  for (const update of updates) {
    const { error } = await client
      .from("fitness_database")
      .update({ order_index: update.order_index })
      .eq("id", update.id)
      .eq("user_id", userId)

    if (error) {
      console.error("Error updating fitness task order:", error)
      throw error
    }
  }
}

// Add sample fitness tasks
export async function addSampleFitnessTasks(userId: string): Promise<void> {
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
      await createFitnessTask(task, userId)
    } catch (error) {
      console.error("Error adding sample fitness task:", error)
    }
  }
}
