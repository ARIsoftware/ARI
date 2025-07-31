import { supabase } from "./supabase"

export interface FitnessStats {
  averagePerDay: number
  mostCompleted: Array<{ name: string; count: number }>
  leastCompleted: Array<{ name: string; count: number }>
}

export interface TodoStats {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  completionRate: number
}

export async function getFitnessStats(): Promise<FitnessStats> {
  try {
    // Get all fitness tasks
    const { data: tasks, error } = await supabase.from("fitness_database").select("title, completed")

    if (error) {
      console.error("Error fetching fitness stats:", error)
      return {
        averagePerDay: 0,
        mostCompleted: [],
        leastCompleted: [],
      }
    }

    if (!tasks || tasks.length === 0) {
      return {
        averagePerDay: 0,
        mostCompleted: [],
        leastCompleted: [],
      }
    }

    // Calculate completion stats
    const completedTasks = tasks.filter((task) => task.completed)
    const pendingTasks = tasks.filter((task) => !task.completed)

    // Simple average calculation (could be enhanced with date-based logic)
    const averagePerDay = Math.round((completedTasks.length / Math.max(tasks.length, 1)) * 100) / 100

    // Get most and least completed (simplified - showing completed vs pending)
    const mostCompleted = completedTasks.slice(0, 3).map((task) => ({
      name: task.title,
      count: 1,
    }))

    const leastCompleted = pendingTasks.slice(0, 3).map((task) => ({
      name: task.title,
      count: 0,
    }))

    return {
      averagePerDay,
      mostCompleted,
      leastCompleted,
    }
  } catch (error) {
    console.error("Error in getFitnessStats:", error)
    return {
      averagePerDay: 0,
      mostCompleted: [],
      leastCompleted: [],
    }
  }
}

export async function getTodoStats(): Promise<TodoStats> {
  try {
    // Get all tasks from the ari-database table
    const { data: tasks, error } = await supabase.from("ari-database").select("title, completed, status")

    if (error) {
      console.error("Error fetching todo stats:", error)
      return {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        completionRate: 0,
      }
    }

    if (!tasks || tasks.length === 0) {
      return {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        completionRate: 0,
      }
    }

    const totalTasks = tasks.length
    const completedTasks = tasks.filter((task) => task.completed || task.status === "Completed").length
    const pendingTasks = totalTasks - completedTasks
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      completionRate,
    }
  } catch (error) {
    console.error("Error in getTodoStats:", error)
    return {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      completionRate: 0,
    }
  }
}
