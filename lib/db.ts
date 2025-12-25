import { createClient } from "@supabase/supabase-js"

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
  // Validate at runtime (not build time) to avoid Vercel build failures
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required')
  }
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SECRET_KEY environment variable is required')
  }

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
