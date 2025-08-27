import { supabase } from "./supabase"

export interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

export async function getFitnessStats(): Promise<FitnessStats> {
  try {
    // Get all fitness tasks with their completion counts
    const { data: tasks, error } = await supabase
      .from("fitness_database")
      .select("id, title, completion_count, created_at")
      .order("completion_count", { ascending: false })

    if (error) {
      console.error("Error fetching fitness stats:", error)
      throw error
    }

    if (!tasks || tasks.length === 0) {
      return {
        averageCompletionsPerDay: 0,
        mostCompletedTask: null,
        leastCompletedTask: null,
        totalCompletions: 0
      }
    }

    // Calculate total completions
    const totalCompletions = tasks.reduce((sum, task) => sum + (task.completion_count || 0), 0)

    // Find most and least completed tasks (only include tasks with completions > 0)
    const tasksWithCompletions = tasks.filter(task => (task.completion_count || 0) > 0)
    
    const mostCompletedTask = tasksWithCompletions.length > 0 
      ? { title: tasksWithCompletions[0].title, count: tasksWithCompletions[0].completion_count || 0 }
      : null

    const leastCompletedTask = tasksWithCompletions.length > 0
      ? { 
          title: tasksWithCompletions[tasksWithCompletions.length - 1].title, 
          count: tasksWithCompletions[tasksWithCompletions.length - 1].completion_count || 0 
        }
      : null

    // Calculate average completions per day
    // Get the earliest task creation date to calculate days since start
    const earliestTask = tasks.reduce((earliest, task) => {
      const taskDate = new Date(task.created_at)
      const earliestDate = new Date(earliest.created_at)
      return taskDate < earliestDate ? task : earliest
    }, tasks[0])

    const daysSinceStart = Math.max(1, Math.ceil((Date.now() - new Date(earliestTask.created_at).getTime()) / (1000 * 60 * 60 * 24)))
    const averageCompletionsPerDay = totalCompletions / daysSinceStart

    return {
      averageCompletionsPerDay,
      mostCompletedTask,
      leastCompletedTask,
      totalCompletions
    }
  } catch (error) {
    console.error("Failed to calculate fitness stats:", error)
    return {
      averageCompletionsPerDay: 0,
      mostCompletedTask: null,
      leastCompletedTask: null,
      totalCompletions: 0
    }
  }
}

// Function to increment completion count when a FITNESS task is completed
export async function incrementFitnessTaskCompletion(taskId: string): Promise<void> {
  try {
    // Get current fitness task details
    const { data: task, error: fetchError } = await supabase
      .from("fitness_database")
      .select("completion_count, title")
      .eq("id", taskId)
      .single()

    if (fetchError) {
      console.error("Error fetching fitness task for completion increment:", fetchError)
      throw fetchError
    }

    // Increment the completion count
    const newCount = (task?.completion_count || 0) + 1

    // Update the completion count in fitness_database
    const { error: updateError } = await supabase
      .from("fitness_database")  
      .update({ 
        completion_count: newCount,
        updated_at: new Date().toISOString()
      })
      .eq("id", taskId)

    if (updateError) {
      console.error("Error incrementing fitness task completion:", updateError)
      throw updateError
    }

    // Add entry to fitness_completion_history
    // Note: This table uses fitness_task_title (not fitness_task_id) based on the schema
    const { error: historyError } = await supabase
      .from("fitness_completion_history")
      .insert([{
        fitness_task_title: task?.title || "Unknown Task",
        completed_at: new Date().toISOString()
      }])

    if (historyError) {
      console.error("Error adding to fitness completion history:", historyError)
      // Don't throw here - the main completion count update was successful
    }
  } catch (error) {
    console.error("Failed to increment fitness task completion:", error)
    throw error
  }
}

// Keep the old function for regular tasks (ari-database)
export async function incrementTaskCompletion(taskId: string, getToken: () => Promise<string | null>): Promise<void> {
  try {
    const token = await getToken()
    
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/tasks/increment-completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ taskId }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("Error incrementing task completion:", error)
      throw new Error(error.error || 'Failed to increment task completion')
    }
  } catch (error) {
    console.error("Failed to increment task completion:", error)
    throw error
  }
}