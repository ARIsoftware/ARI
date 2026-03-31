import { type FitnessTask } from "@/lib/supabase"
import { incrementFitnessTaskCompletion } from "./fitness-stats"

export type { FitnessTask }

export async function getFitnessTasks(): Promise<FitnessTask[]> {
  const response = await fetch('/api/modules/daily-fitness', {
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error fetching fitness tasks:", error)
    throw new Error(error.error || 'Failed to fetch fitness tasks')
  }

  const data = await response.json()
  return data
}

export async function createFitnessTask(task: Omit<FitnessTask, "id" | "created_at" | "updated_at" | "order_index"> & { youtube_url?: string | null }): Promise<FitnessTask> {
  const response = await fetch('/api/modules/daily-fitness', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ task }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error creating fitness task:", error)
    throw new Error(error.error || 'Failed to create fitness task')
  }

  const data = await response.json()
  return data
}

export async function updateFitnessTask(id: string, updates: Partial<FitnessTask>): Promise<FitnessTask> {
  const response = await fetch('/api/modules/daily-fitness', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ id, updates }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error updating fitness task:", error)
    throw new Error(error.error || 'Failed to update fitness task')
  }

  return await response.json()
}

export async function deleteFitnessTask(id: string): Promise<void> {
  const response = await fetch(`/api/modules/daily-fitness?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error deleting fitness task:", error)
    throw new Error(error.error || 'Failed to delete fitness task')
  }
}

export async function toggleFitnessTaskCompletion(id: string, currentCompleted: boolean): Promise<FitnessTask> {
  const newCompleted = !currentCompleted
  const newStatus = newCompleted ? "Completed" : "Pending"

  // Update the fitness task
  const updatedTask = await updateFitnessTask(id, {
    completed: newCompleted,
    status: newStatus,
  })

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

export async function toggleFitnessTaskPin(id: string, currentPinned: boolean): Promise<FitnessTask> {
  return updateFitnessTask(id, {
    pinned: !currentPinned,
  })
}

export async function reorderFitnessTasks(taskIds: string[]): Promise<void> {
  // Update order_index for each task based on its position in the array
  for (let i = 0; i < taskIds.length; i++) {
    try {
      await updateFitnessTask(taskIds[i], { order_index: i })
    } catch (error) {
      console.error("Error updating fitness task order:", error)
      throw error
    }
  }
}

// Add sample fitness tasks
export async function addSampleFitnessTasks(): Promise<void> {
  const response = await fetch('/api/modules/daily-fitness/sample', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("Error adding sample fitness tasks:", error)
    throw new Error(error.error || 'Failed to add sample fitness tasks')
  }
}
