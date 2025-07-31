"use client"

import { createClient } from "@supabase/supabase-js"
import { useAuth } from "@clerk/nextjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function useSupabaseWithClerk() {
  const { getToken } = useAuth()

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options = {}) => {
        const clerkToken = await getToken({ template: "supabase" })

        const headers = new Headers(options?.headers)
        if (clerkToken) {
          headers.set("Authorization", `Bearer ${clerkToken}`)
        }

        return fetch(url, {
          ...options,
          headers,
        })
      },
    },
  })

  return supabase
}
