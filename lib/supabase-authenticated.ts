import { createClient } from "@supabase/supabase-js"
import { useSessionContext, useSupabaseClient } from "@supabase/auth-helpers-react"
import { useEffect, useState } from "react"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create a Supabase client that works with native Supabase authentication
export function useSupabaseAuthenticated() {
  const { session } = useSessionContext()
  const baseClient = useSupabaseClient()
  const [supabaseClient, setSupabaseClient] = useState(() =>
    createClient(supabaseUrl, supabaseAnonKey)
  )

  useEffect(() => {
    const updateSupabaseAuth = async () => {
      try {
        // Get the session access token
        const token = session?.access_token
        
        if (token) {
          // Create a new Supabase client with the session token
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
        } else {
          // If no token, use the base client from auth helpers
          setSupabaseClient(baseClient)
        }
      } catch (error) {
        console.error("Error getting session token for Supabase:", error)
      }
    }

    updateSupabaseAuth()
  }, [session?.access_token, baseClient])

  return supabaseClient
}

// Get authenticated Supabase client (non-hook version)
export async function getAuthenticatedSupabase() {
  const { createSupabaseClient } = await import('@/lib/supabase-auth')
  return createSupabaseClient()
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