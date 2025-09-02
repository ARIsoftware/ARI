import { type FitnessTask } from "./supabase"
import { incrementFitnessTaskCompletion } from "./fitness-stats"

export type { FitnessTask }

export async function getFitnessTasks(getToken: () => Promise<string | null>): Promise<FitnessTask[]> {
  console.log("Attempting to fetch fitness tasks from fitness_database table")
  
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/fitness-tasks', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  
  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching fitness tasks:", error)
    throw new Error(error.error || 'Failed to fetch fitness tasks')
  }

  const data = await response.json()
  console.log("Successfully fetched fitness tasks:", data)
  return data
}

export async function createFitnessTask(task: Omit<FitnessTask, "id" | "created_at" | "updated_at" | "order_index"> & { youtube_url?: string | null }, getToken: () => Promise<string | null>): Promise<FitnessTask> {
  console.log("Attempting to create fitness task:", task)
  
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/fitness-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ task }),
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

export async function updateFitnessTask(id: string, updates: Partial<FitnessTask>, getToken: () => Promise<string | null>): Promise<FitnessTask> {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/fitness-tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ id, updates }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating fitness task:", error)
    throw new Error(error.error || 'Failed to update fitness task')
  }

  return await response.json()
}

export async function deleteFitnessTask(id: string, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`/api/fitness-tasks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting fitness task:", error)
    throw new Error(error.error || 'Failed to delete fitness task')
  }
}

export async function toggleFitnessTaskCompletion(id: string, currentCompleted: boolean, getToken: () => Promise<string | null>): Promise<FitnessTask> {
  const newCompleted = !currentCompleted
  const newStatus = newCompleted ? "Completed" : "Pending"

  // Update the fitness task
  const updatedTask = await updateFitnessTask(id, {
    completed: newCompleted,
    status: newStatus,
  }, getToken)

  // If the task is being marked as completed, increment completion count and add to history
  if (newCompleted) {
    try {
      await incrementFitnessTaskCompletion(id, getToken)
    } catch (error) {
      console.error("Failed to increment fitness task completion:", error)
      // Don't throw here - the task update was successful, completion count increment is secondary
    }
  }

  return updatedTask
}

export async function toggleFitnessTaskStar(id: string, currentStarred: boolean, getToken: () => Promise<string | null>): Promise<FitnessTask> {
  return updateFitnessTask(id, {
    starred: !currentStarred,
  }, getToken)
}

export async function reorderFitnessTasks(taskIds: string[], getToken: () => Promise<string | null>): Promise<void> {
  // Update order_index for each task based on its position in the array
  for (let i = 0; i < taskIds.length; i++) {
    try {
      await updateFitnessTask(taskIds[i], { order_index: i }, getToken)
    } catch (error) {
      console.error("Error updating fitness task order:", error)
      throw error
    }
  }
}

// Add sample fitness tasks
export async function addSampleFitnessTasks(getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  
  if (!token) {
    throw new Error('Authentication required')
  }

  const response = await fetch('/api/sample-fitness-tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error adding sample fitness tasks:", error)
    throw new Error(error.error || 'Failed to add sample fitness tasks')
  }
}
