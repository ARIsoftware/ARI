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
export const getAuthenticatedSupabase = async () => {
  // Use service role key to bypass RLS while keeping it enabled
  // This is a temporary solution until Clerk JWT is properly configured
  const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || 
                         process.env.SUPABASE_SERVICE_ROLE_KEY ||
                         'REDACTED_SUPABASE_LEGACY_KEY'
  
  if (serviceRoleKey) {
    // Use service role key which bypasses RLS
    return createClient(supabaseUrl, serviceRoleKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  }
  
  // Fallback to regular client
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
