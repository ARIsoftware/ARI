import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * @deprecated This file is deprecated after Better Auth migration.
 * Use the supabase client from useSupabase() hook for realtime,
 * or use API routes for data operations.
 */

// Get authenticated Supabase client (non-hook version)
// Returns a basic client - auth is now handled by Better Auth
export async function getAuthenticatedSupabase() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })
}
