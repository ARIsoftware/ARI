import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

/**
 * Server-side only database client using service role key.
 * This bypasses RLS - all access control is done at application level.
 *
 * IMPORTANT: Only use in API routes and server components.
 * Never expose to client-side code.
 */
export function createDbClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}
