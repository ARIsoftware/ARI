import { supabase } from "./supabase"

export interface Task {
  id: string
  title: string
  description?: string
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  assignees?: string[]
  due_date?: string
  subtasks?: string[]
  created_at: string
  updated_at: string
  user_id: string
  order_index: number
}

export async function getTasks(userId: string): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from("ari-database")
      .select("*")
      .eq("user_id", userId)
      .order("order_index", { ascending: true })

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
    const { data, error } = await supabase
      .from("ari-database")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

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

export async function reorderTasks(taskIds: string[]): Promise<boolean> {
  try {
    const updates = taskIds.map((id, index) => ({
      id,
      order_index: index,
    }))

    for (const update of updates) {
      const { error } = await supabase
        .from("ari-database")
        .update({ order_index: update.order_index })
        .eq("id", update.id)

      if (error) {
        console.error("Error updating task order:", error)
        return false
      }
    }

    return true
  } catch (error) {
    console.error("Error in reorderTasks:", error)
    return false
  }
}
