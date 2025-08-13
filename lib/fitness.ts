import { type FitnessTask } from "./supabase"
import { incrementFitnessTaskCompletion } from "./fitness-stats"

export type { FitnessTask }

export async function getFitnessTasks(userId: string): Promise<FitnessTask[]> {
  console.log("Attempting to fetch fitness tasks from fitness_database table for user:", userId)
  
  const response = await fetch(`/api/fitness-tasks?userId=${encodeURIComponent(userId)}`)
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching fitness tasks:", error)
    throw new Error(error.error || 'Failed to fetch fitness tasks')
  }

  const data = await response.json()
  console.log("Successfully fetched fitness tasks:", data)
  return data
}

export async function createFitnessTask(task: Omit<FitnessTask, "id" | "created_at" | "updated_at" | "order_index"> & { youtube_url?: string | null }, userId: string): Promise<FitnessTask> {
  console.log("Attempting to create fitness task:", task, "for user:", userId)
  
  const response = await fetch('/api/fitness-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task, userId }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating fitness task:", error)
    throw new Error(error.error || 'Failed to create fitness task')
  }

  const data = await response.json()
  console.log("Successfully created fitness task:", data)
  return data
}

export async function updateFitnessTask(id: string, updates: Partial<FitnessTask>, userId: string): Promise<FitnessTask> {
  const response = await fetch('/api/fitness-tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, updates, userId }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating fitness task:", error)
    throw new Error(error.error || 'Failed to update fitness task')
  }

  return await response.json()
}

export async function deleteFitnessTask(id: string, userId: string): Promise<void> {
  const response = await fetch(`/api/fitness-tasks?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting fitness task:", error)
    throw new Error(error.error || 'Failed to delete fitness task')
  }
}

export async function toggleFitnessTaskCompletion(id: string, userId: string, currentCompleted: boolean): Promise<FitnessTask> {
  const newCompleted = !currentCompleted
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

export async function toggleFitnessTaskStar(id: string, userId: string, currentStarred: boolean): Promise<FitnessTask> {
  return updateFitnessTask(id, {
    starred: !currentStarred,
  }, userId)
}

export async function reorderFitnessTasks(taskIds: string[], userId: string): Promise<void> {
  // Update order_index for each task based on its position in the array
  for (let i = 0; i < taskIds.length; i++) {
    try {
      await updateFitnessTask(taskIds[i], { order_index: i }, userId)
    } catch (error) {
      console.error("Error updating fitness task order:", error)
      throw error
    }
  }
}

// Add sample fitness tasks
export async function addSampleFitnessTasks(userId: string): Promise<void> {
  const response = await fetch('/api/sample-fitness-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error adding sample fitness tasks:", error)
    throw new Error(error.error || 'Failed to add sample fitness tasks')
  }
}
