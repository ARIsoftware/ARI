import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Check if Supabase is configured (for setup mode)
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// Singleton instance for the browser client to prevent GoTrueClient warnings
let browserClientInstance: SupabaseClient | null = null

// Client-side Supabase client for use in components
// Returns null when Supabase is not configured (setup mode)
// Uses singleton pattern to prevent multiple GoTrueClient instances
export function createSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null
  }

  // Return cached instance if available
  if (browserClientInstance) {
    return browserClientInstance
  }

  // Create and cache the instance
  browserClientInstance = createBrowserClient(supabaseUrl!, supabaseAnonKey!)
  return browserClientInstance
}