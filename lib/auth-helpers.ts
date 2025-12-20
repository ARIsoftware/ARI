import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { createDbClient } from "@/lib/db"

/**
 * Get authenticated user and database client for API routes.
 * Returns a compatible shape with the old Supabase auth for minimal migration friction.
 */
export async function getAuthenticatedUser() {
  // Skip auth during build/static generation to prevent build errors
  // NEXT_PHASE is set by Next.js during different build phases
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return { user: null, session: null, supabase: null }
  }

  // Also skip if critical env vars are missing (indicates build-time execution)
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
    return { user: null, session: null, supabase: null }
  }

  let session
  try {
    session = await auth.api.getSession({
      headers: await headers(),
    })
  } catch (error) {
    // Only log in development to avoid noisy production logs
    if (process.env.NODE_ENV === 'development') {
      console.error('Auth session check failed:', error)
    }
    return { user: null, session: null, supabase: null }
  }

  if (!session) {
    return { user: null, session: null, supabase: null }
  }

  // Create database client (service role, bypasses RLS)
  const supabase = createDbClient()

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      // Map Better Auth fields to match old Supabase structure for compatibility
      user_metadata: {
        first_name: session.user.firstName,
        last_name: session.user.lastName,
        full_name: session.user.name,
        avatar_url: session.user.image,
      },
    },
    session: {
      access_token: session.session.token, // Map to old property name
      user: session.user,
    },
    supabase,
  }
}

/**
 * @deprecated Use getAuthenticatedUser() instead.
 * Kept for backwards compatibility during migration.
 */
export async function createAuthenticatedClient() {
  return createDbClient()
}
