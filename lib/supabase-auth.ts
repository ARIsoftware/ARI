import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Check if Supabase is configured (for setup mode)
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

// Client-side Supabase client for use in components
// Returns null when Supabase is not configured (setup mode)
export function createSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null
  }
  return createBrowserClient(supabaseUrl!, supabaseAnonKey!)
}

// Legacy client for backwards compatibility (without auth)
// Returns null when Supabase is not configured (setup mode)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null