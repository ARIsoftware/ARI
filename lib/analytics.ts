import { createClient } from "@/lib/supabase"

export interface FitnessStats {
  averagePerDay: number
  mostCompleted: Array<{ name: string }>
  leastCompleted: Array<{ name: string }>
}

export interface TodoStats {
  totalTasks: number
  completedThisWeek: number
  completionRate: number
}

export async function getFitnessStats(): Promise<FitnessStats> {
  try {
    const supabase = createClient()

    // Get all fitness tasks (no user_id filter since the column doesn't exist)
    const { data: tasks, error: tasksError } = await supabase.from("fitness_database").select("*")

    if (tasksError) {
      console.error("Error fetching fitness tasks:", tasksError)
      return {
        averagePerDay: 0,
        mostCompleted: [],
        leastCompleted: [],
      }
    }

    const totalTasks = tasks?.length || 0
    const completedTasks = tasks?.filter((task) => task.completed).length || 0
    const averagePerDay = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) / 100 : 0

    // Get most and least completed tasks
    const mostCompleted =
      tasks
        ?.filter((task) => task.completed)
        .slice(0, 3)
        .map((task) => ({
          name: task.title || "Unnamed Task",
        })) || []

    const leastCompleted =
      tasks
        ?.filter((task) => !task.completed)
        .slice(0, 3)
        .map((task) => ({
          name: task.title || "Unnamed Task",
        })) || []

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
    const supabase = createClient()

    // Get all tasks from the ari-database table
    const { data: tasks, error } = await supabase.from("ari-database").select("*")

    if (error) {
      console.error("Error fetching tasks:", error)
      return {
        totalTasks: 0,
        completedThisWeek: 0,
        completionRate: 0,
      }
    }

    const totalTasks = tasks?.length || 0
    const completedTasks = tasks?.filter((task) => task.status === "Completed").length || 0

    // Calculate completed this week
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const completedThisWeek =
      tasks?.filter((task) => task.status === "Completed" && task.updated_at && new Date(task.updated_at) >= oneWeekAgo)
        .length || 0

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    return {
      totalTasks,
      completedThisWeek,
      completionRate,
    }
  } catch (error) {
    console.error("Error in getTodoStats:", error)
    return {
      totalTasks: 0,
      completedThisWeek: 0,
      completionRate: 0,
    }
  }
}
