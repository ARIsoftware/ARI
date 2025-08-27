import { createClient } from "@supabase/supabase-js"
import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Creates an authenticated Supabase client for API routes using Clerk JWT token
 * This enables Row Level Security (RLS) policies to work properly
 */
export async function createAuthenticatedSupabaseClient() {
  // Get the current user from Clerk
  const { userId, getToken } = auth()
  
  if (!userId) {
    throw new Error("Unauthorized: No user session found")
  }

  try {
    // Get the JWT token with Supabase template
    const token = await getToken({ template: "supabase" })
    
    if (!token) {
      throw new Error("Unauthorized: Failed to get Supabase JWT token")
    }

    // Create Supabase client with the JWT token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

    return {
      supabase,
      userId,
      token
    }
  } catch (error) {
    console.error("Error creating authenticated Supabase client:", error)
    throw new Error("Unauthorized: Invalid authentication token")
  }
}

/**
 * Alternative method that extracts JWT from Authorization header
 * Use this if you need to pass tokens manually from client
 */
export function createSupabaseClientFromToken(jwtToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })
}

/**
 * Extract JWT token from request Authorization header
 */
export function extractTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null
  }
  return authHeader.substring(7) // Remove "Bearer " prefix
}

/**
 * Utility function to handle common API authentication pattern
 */
export async function withAuthentication<T>(
  handler: (supabase: ReturnType<typeof createClient>, userId: string) => Promise<T>
): Promise<T> {
  const { supabase, userId } = await createAuthenticatedSupabaseClient()
  return handler(supabase, userId)
}