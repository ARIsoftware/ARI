import { createClient } from "@supabase/supabase-js"

// Validate required environment variables at startup
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required')
}
if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SERVICE_KEY environment variable is required')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

/**
 * Server-side only database client using service role key.
 * This bypasses RLS - all access control is done at application level.
 *
 * IMPORTANT: Only use in API routes and server components.
 * Never expose to client-side code.
 *
 * SECURITY: Since this bypasses RLS, ALWAYS add .eq('user_id', user.id)
 * to queries to ensure user isolation.
 */
export function createDbClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-client-info': 'ari-server',
      },
    },
  })
}
