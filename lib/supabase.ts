import { createClient, SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!

// Singleton instance to prevent multiple GoTrueClient warnings
let supabaseInstance: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })

  return supabaseInstance
}

// Export getter instead of direct instance to ensure singleton
export const supabase = getSupabaseClient()

// Create a function to get authenticated supabase client
// NOTE: This function is now deprecated - use API routes instead
// Secret keys can no longer be used in browser environments
export const getAuthenticatedSupabase = async () => {
  // Fallback to regular client with anon key
  // All database operations should now go through API routes
  return getSupabaseClient()
}

export type Task = {
  id: string
  title: string
  assignees: string[]
  due_date: string | null
  subtasks_completed: number
  subtasks_total: number
  status: "Pending" | "In Progress" | "Completed"
  priority: "Low" | "Medium" | "High"
  pinned: boolean
  completed: boolean
  created_at: string
  updated_at: string
  order_index: number
  impact?: number
  severity?: number
  timeliness?: number
  effort?: number
  strategic_fit?: number
  priority_score?: number
  project_id?: string | null
  // Task Monsters fields
  monster_type?: string | null
  monster_colors?: { primary: string; secondary: string } | null
}

export type FitnessTask = {
  id: string
  title: string
  assignees: string[]
  due_date: string | null
  subtasks_completed: number
  subtasks_total: number
  status: "Pending" | "In Progress" | "Completed"
  priority: "Low" | "Medium" | "High"
  pinned: boolean
  completed: boolean
  created_at: string
  updated_at: string
  order_index: number
  youtube_url?: string | null
}
