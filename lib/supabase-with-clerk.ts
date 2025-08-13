import { createClient } from "@supabase/supabase-js"
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState } from "react"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create a Supabase client that works with Clerk authentication
export function useSupabaseWithClerk() {
  const { getToken } = useAuth()
  const [supabaseClient, setSupabaseClient] = useState(() =>
    createClient(supabaseUrl, supabaseAnonKey)
  )

  useEffect(() => {
    const updateSupabaseAuth = async () => {
      try {
        // Get the Clerk session token
        const token = await getToken({ template: "supabase" })
        
        if (token) {
          // Create a new Supabase client with the Clerk token
          const client = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            realtime: {
              params: {
                eventsPerSecond: 10,
              },
            },
          })
          setSupabaseClient(client)
        }
      } catch (error) {
        console.error("Error getting Clerk token for Supabase:", error)
      }
    }

    updateSupabaseAuth()
  }, [getToken])

  return supabaseClient
}

// Alternative: Use secret key for development
// WARNING: Never expose secret key in production!
export const supabaseServiceRole = () => {
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!secretKey) {
    console.warn("Secret key not found, using anon key")
    return createClient(supabaseUrl, supabaseAnonKey)
  }
  
  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
