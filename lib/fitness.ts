import { createClient } from "@/lib/supabase"

export interface FitnessTask {
  id: string
  title: string
  description?: string
  completed: boolean
  created_at: string
  updated_at: string
}

export async function getFitnessTasks(): Promise<FitnessTask[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("fitness_database")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching fitness tasks:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("Error in getFitnessTasks:", error)
    return []
  }
}

export async function createFitnessTask(
  task: Omit<FitnessTask, "id" | "created_at" | "updated_at">,
): Promise<FitnessTask | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from("fitness_database").insert([task]).select().single()

    if (error) {
      console.error("Error creating fitness task:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error in createFitnessTask:", error)
    return null
  }
}

export async function updateFitnessTask(id: string, updates: Partial<FitnessTask>): Promise<FitnessTask | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from("fitness_database").update(updates).eq("id", id).select().single()

    if (error) {
      console.error("Error updating fitness task:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error in updateFitnessTask:", error)
    return null
  }
}

export async function deleteFitnessTask(id: string): Promise<boolean> {
  try {
    const supabase = createClient()
    const { error } = await supabase.from("fitness_database").delete().eq("id", id)

    if (error) {
      console.error("Error deleting fitness task:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Error in deleteFitnessTask:", error)
    return false
  }
}
