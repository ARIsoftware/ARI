import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { createDbClient } from "@/lib/db-supabase"
import { withUserContext, type DrizzleDb } from "@/lib/db"

/**
 * Get authenticated user and database client for API routes.
 * Returns a compatible shape with the old Supabase auth for minimal migration friction.
 *
 * @returns Object with user, session, supabase (legacy), and withRLS (new Drizzle helper)
 */
export async function getAuthenticatedUser() {
  // Skip auth during build/static generation to prevent build errors
  // NEXT_PHASE is set by Next.js during different build phases
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return { user: null, session: null, supabase: null, withRLS: null }
  }

  // Also skip if critical env vars are missing (indicates build-time execution)
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
    return { user: null, session: null, supabase: null, withRLS: null }
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
    return { user: null, session: null, supabase: null, withRLS: null }
  }

  if (!session) {
    return { user: null, session: null, supabase: null, withRLS: null }
  }

  // Lazy Supabase client — only created if accessed (most callers only use withRLS)
  // @deprecated - use withRLS() instead for new code
  let _supabase: ReturnType<typeof createDbClient> | null = null

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
    get supabase() {
      if (!_supabase) _supabase = createDbClient()
      return _supabase
    },
    /**
     * Execute DB operations with RLS enforced for this user.
     * All queries will be filtered to only return this user's data.
     *
     * IMPORTANT: For INSERT operations, you must still set user_id explicitly!
     * RLS validates the value but doesn't auto-populate it.
     *
     * @example
     * ```ts
     * const { user, withRLS } = await getAuthenticatedUser()
     * if (!user || !withRLS) return unauthorized()
     *
     * // SELECT - no .where() needed, RLS filters automatically
     * const tasks = await withRLS((db) =>
     *   db.select().from(tasks).orderBy(desc(tasks.createdAt))
     * )
     *
     * // INSERT - must set user_id explicitly
     * const newTask = await withRLS((db) =>
     *   db.insert(tasks).values({ title: 'New', user_id: user.id })
     * )
     * ```
     */
    withRLS: <T>(operation: (db: DrizzleDb) => Promise<T>): Promise<T> =>
      withUserContext(session.user.id, operation),
  }
}

/**
 * @deprecated Use getAuthenticatedUser() instead.
 * Kept for backwards compatibility during migration.
 */
export async function createAuthenticatedClient() {
  return createDbClient()
}
