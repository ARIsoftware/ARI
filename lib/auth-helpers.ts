import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { createDbClient } from "@/lib/db-supabase"
import { withUserContext, withAdminDb, type DrizzleDb } from "@/lib/db"
import { hashApiKey, lookupApiKey, checkIpAllowed } from "@/lib/api-keys"
import { user as userTable } from "@/lib/db/schema/core-schema"
import { eq } from "drizzle-orm"

const NULL_AUTH = { user: null, session: null, supabase: null, withRLS: null }

/**
 * Get authenticated user and database client for API routes.
 * Supports two auth methods:
 * 1. Better Auth session cookie (browser sessions)
 * 2. API key via x-api-key header (external applications)
 *
 * @returns Object with user, session, supabase (legacy), and withRLS (new Drizzle helper)
 */
export async function getAuthenticatedUser() {
  // Skip auth during build/static generation to prevent build errors
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return NULL_AUTH
  }

  // Also skip if critical env vars are missing (indicates build-time execution)
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
    return NULL_AUTH
  }

  const reqHeaders = await headers()

  // --- Try Better Auth session first ---
  let session
  try {
    session = await auth.api.getSession({ headers: reqHeaders })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Auth session check failed:', error)
    }
  }

  if (session) {
    // Lazy Supabase client — only created if accessed (most callers only use withRLS)
    // @deprecated - use withRLS() instead for new code
    let _supabase: ReturnType<typeof createDbClient> | null = null

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        user_metadata: {
          first_name: session.user.firstName,
          last_name: session.user.lastName,
          full_name: session.user.name,
          avatar_url: session.user.image,
        },
      },
      session: {
        access_token: session.session.token,
        user: session.user,
      },
      get supabase() {
        if (!_supabase) _supabase = createDbClient()
        return _supabase
      },
      withRLS: <T>(operation: (db: DrizzleDb) => Promise<T>): Promise<T> =>
        withUserContext(session.user.id, operation),
    }
  }

  // --- Fallback: try API key auth ---
  const apiKeyRaw = reqHeaders.get('x-api-key')
  if (!apiKeyRaw) return NULL_AUTH

  try {
    const keyHash = hashApiKey(apiKeyRaw)
    const keyRow = await lookupApiKey(keyHash)
    if (!keyRow) return NULL_AUTH

    // Check IP allowlist
    const requestIp = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
      || reqHeaders.get('x-real-ip')
      || null
    if (!checkIpAllowed(keyRow.allowedIps, requestIp)) {
      return NULL_AUTH
    }

    // Fetch user record
    const userRows = await withAdminDb(async (db) =>
      db.select().from(userTable).where(eq(userTable.id, keyRow.userId)).limit(1)
    )
    const userRow = userRows[0]
    if (!userRow) return NULL_AUTH

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        user_metadata: {
          first_name: userRow.firstName,
          last_name: userRow.lastName,
          full_name: userRow.name,
          avatar_url: userRow.image,
        },
      },
      session: null,
      supabase: null,
      withRLS: <T>(operation: (db: DrizzleDb) => Promise<T>): Promise<T> =>
        withUserContext(keyRow.userId, operation),
      /** API key metadata — only set when authenticated via API key */
      apiKey: {
        id: keyRow.id,
        userId: keyRow.userId,
        ipAddress: requestIp,
        userAgent: reqHeaders.get('user-agent'),
      },
    }
  } catch (error) {
    console.error('API key auth failed:', error)
    return NULL_AUTH
  }
}

/**
 * @deprecated Use getAuthenticatedUser() instead.
 * Kept for backwards compatibility during migration.
 */
export async function createAuthenticatedClient() {
  return createDbClient()
}
