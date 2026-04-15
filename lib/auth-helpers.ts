import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { pool } from "@/lib/db/pool"
import { withUserContext, withAdminDb, type DrizzleDb } from "@/lib/db"
import { hashApiKey, lookupApiKey, checkIpAllowed } from "@/lib/api-keys"
import { user as userTable } from "@/lib/db/schema/core-schema"
import { eq } from "drizzle-orm"

const NULL_AUTH = { user: null, session: null, withRLS: null }

/**
 * Get authenticated user and database client for API routes.
 * Supports two auth methods:
 * 1. Better Auth session cookie (browser sessions)
 * 2. API key via x-api-key header (external applications)
 *
 * @returns Object with user, session, and withRLS (Drizzle helper)
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
 * Check whether users exist in the database. Used by the welcome layout guard
 * and API route guards to decide whether authentication is required.
 */
export type UsersCheckResult =
  | { status: "no-env" }
  | { status: "no-pool" }
  | { status: "no-table" }
  | { status: "db-error" }
  | { status: "no-users" }
  | { status: "has-users" }

export async function checkUsersExist(): Promise<UsersCheckResult> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return { status: "no-env" }
  if (!pool) return { status: "no-pool" }
  try {
    const result = await pool.query('SELECT EXISTS(SELECT 1 FROM public."user") AS has_users')
    return result.rows[0]?.has_users === true ? { status: "has-users" } : { status: "no-users" }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === "42P01") return { status: "no-table" }
    return { status: "db-error" }
  }
}

/**
 * Guard for routes that should be public during setup but require auth after.
 * Returns null if access is allowed, or a 401/503 NextResponse if denied.
 */
export async function requireAuthIfUsersExist(requestHeaders: Headers): Promise<NextResponse | null> {
  const check = await checkUsersExist()
  if (check.status === "db-error") {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (check.status !== "has-users") return null
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
