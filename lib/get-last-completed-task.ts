import { getAuthenticatedSupabase } from "./supabase"

export async function getLastCompletedTask(userId?: string) {
  try {
    const client = await getAuthenticatedSupabase()
    
    let query = client
      .from("ari-database")
      .select("title, updated_at")
      .eq("completed", true)
    
    // Add user_id filter if provided
    if (userId) {
      query = query.eq("user_id", userId)
    }
    
    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // Don't log error if no rows found (this is normal)
      if (error.code !== 'PGRST116') {
        console.error("Error fetching last completed task:", error)
      }
      return null
    }

    return data
  } catch (error) {
    console.error("Error in getLastCompletedTask:", error)
    return null
  }
}

export function truncateTaskName(taskName: string, maxLength: number = 50): string {
  if (taskName.length <= maxLength) return taskName
  return taskName.substring(0, maxLength) + "..."
}