import { createClient } from "@/lib/supabase"

export interface Task {
  id: string
  title: string
  description?: string
  status: "To Do" | "In Progress" | "Completed"
  priority: "Low" | "Medium" | "High"
  created_at: string
  updated_at: string
  order?: number
}

export async function getTasks(): Promise<Task[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from("ari-database").select("*").order("order", { ascending: true })

    if (error) {
      console.error("Error fetching tasks:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("Error in getTasks:", error)
    return []
  }
}

export async function createTask(task: Omit<Task, "id" | "created_at" | "updated_at">): Promise<Task | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from("ari-database").insert([task]).select().single()

    if (error) {
      console.error("Error creating task:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error in createTask:", error)
    return null
  }
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from("ari-database").update(updates).eq("id", id).select().single()

    if (error) {
      console.error("Error updating task:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error in updateTask:", error)
    return null
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    const supabase = createClient()
    const { error } = await supabase.from("ari-database").delete().eq("id", id)

    if (error) {
      console.error("Error deleting task:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Error in deleteTask:", error)
    return false
  }
}

export async function updateTaskOrder(tasks: { id: string; order: number }[]): Promise<boolean> {
  try {
    const supabase = createClient()

    for (const task of tasks) {
      const { error } = await supabase.from("ari-database").update({ order: task.order }).eq("id", task.id)

      if (error) {
        console.error("Error updating task order:", error)
        return false
      }
    }

    return true
  } catch (error) {
    console.error("Error in updateTaskOrder:", error)
    return false
  }
}
