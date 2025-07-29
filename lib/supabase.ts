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
}

export type Contact = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company: string | null
  job_title: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  website: string | null
  notes: string | null
  tags: string[]
  favorite: boolean
  avatar_url: string | null
  social_links: {
    linkedin?: string
    twitter?: string
    facebook?: string
    instagram?: string
  }
  created_at: string
  updated_at: string
}
