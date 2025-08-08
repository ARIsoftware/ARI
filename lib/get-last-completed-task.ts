import { supabase } from "./supabase"

export async function getLastCompletedTask() {
  const { data, error } = await supabase
    .from("ari-database")
    .select("title, updated_at")
    .eq("completed", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single()

  if (error) {
    console.error("Error fetching last completed task:", error)
    return null
  }

  return data
}

export function truncateTaskName(taskName: string, maxLength: number = 50): string {
  if (taskName.length <= maxLength) return taskName
  return taskName.substring(0, maxLength) + "..."
}