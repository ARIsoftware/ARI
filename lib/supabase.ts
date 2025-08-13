import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Create a function to get authenticated supabase client
// NOTE: This function is now deprecated - use API routes instead
// Secret keys can no longer be used in browser environments
export const getAuthenticatedSupabase = async () => {
  // Fallback to regular client with anon key
  // All database operations should now go through API routes
  return supabase
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
  starred: boolean
  completed: boolean
  created_at: string
  updated_at: string
  order_index: number
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
  starred: boolean
  completed: boolean
  created_at: string
  updated_at: string
  order_index: number
  youtube_url?: string | null
}
