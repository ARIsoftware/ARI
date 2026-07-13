import { cache } from "react"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { pool } from "@/lib/db/pool"
import { withUserContext, withAdminDb, type DrizzleDb } from "@/lib/db"
import { hashApiKey, lookupApiKey, checkIpAllowed } from "@/lib/api-keys"
import { user as userTable } from "@/lib/db/schema/core-schema"
import { eq } from "drizzle-orm"
import { resolvePermissions, type PermissionMap, type UserRole } from "@/lib/permissions"
import { getPgCode } from "@/lib/db/postgres-error"

const NULL_AUTH = { user: null, session: null, withRLS: null }

/** Transient pool/connection errors worth one retry (mirrors lib/db). */
function isTransientDbError(error: unknown): boolean {
  const msg = (error as { message?: string })?.message || ""
  const code = (error as { code?: string })?.code || ""
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    msg.includes("Connection terminated") ||
    msg.includes("connection is closed") ||
    msg.includes("Client has encountered a connection error")
  )
}

/**
 * Read role/permissions/disabled for a user, optionally validating that a
 * specific session token still exists.
 *
 * Returns null for "no access" (row missing, disabled, or — when a token is
 * given — the session was revoked), a resolved access object, or undefined to
 * signal the columns don't exist yet (42703) so the caller can self-heal.
 * Rethrows every other error so the caller decides whether to retry/fail.
 */
async function queryUserAccess(
  userId: string,
  sessionToken?: string
): Promise<{ role: UserRole; permissions: PermissionMap } | null | undefined> {
  if (!pool) return null
  try {
    // When a session token is supplied, require the session row to still
    // exist. The 5-minute cookie cache can hand us a session that was already
    // revoked (admin password reset, sign-out, disable) without a DB check;
    // folding an EXISTS into this already-per-request query catches that
    // immediately at no extra round trip.
    const params: unknown[] = [userId]
    let sql = 'SELECT "role", "permissions", "disabled" FROM "user" WHERE id = $1'
    if (sessionToken) {
      sql += ' AND EXISTS (SELECT 1 FROM "session" WHERE "token" = $2 AND "userId" = $1)'
      params.push(sessionToken)
    }
    sql += " LIMIT 1"
    const { rows } = await pool.query<{ role: string; permissions: unknown; disabled: boolean }>(sql, params)
    const row = rows[0]
    if (!row || row.disabled === true) return null
    const role: UserRole = row.role === "admin" ? "admin" : "user"
    return { role, permissions: resolvePermissions(role, row.permissions) }
  } catch (error) {
    if (getPgCode(error) === "42703") return undefined
    throw error
  }
}

/**
 * Load role/permissions/disabled straight from the DB user row.
 *
 * Deliberately NOT read from the session payload: session cookies are cached
 * for 5 minutes, so permission changes, a disable, or a session revocation
 * must take effect from the live DB, not the stale cookie. Returns null (fail
 * closed) when the user is disabled/missing, the session was revoked, or the
 * lookup fails after a retry.
 */
async function loadUserAccess(
  userId: string,
  sessionToken?: string
): Promise<{ role: UserRole; permissions: PermissionMap } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const access = await queryUserAccess(userId, sessionToken)
      if (access !== undefined) return access

      // 42703 = the multi-user columns are missing. This can happen at runtime
      // (a backup restore recreated "user" from an older schema era) not just
      // pre-boot, so we self-heal by re-applying setup.sql (idempotent: adds
      // the columns + runs the admin backfill) and retry once. We never fail
      // open to admin — if healing or the retry doesn't produce the columns,
      // fail closed.
      const { reapplySchema } = await import("@/lib/db/ensure-schema")
      const healed = await reapplySchema()
      if (!healed) return null
      const retry = await queryUserAccess(userId, sessionToken)
      return retry ?? null
    } catch (error) {
      // A single stale pooled connection (DB restart, PgBouncer drop) shouldn't
      // masquerade as "signed out" — retry once on a fresh connection before
      // failing closed.
      if (attempt === 0 && isTransientDbError(error)) continue
      console.error("User access lookup failed:", error)
      return null
    }
  }
  return null
}

/** Fetch the full user row for API-key auth, healing on a missing column. */
async function fetchApiKeyUserRow(userId: string) {
  const run = () =>
    withAdminDb(async (db) =>
      db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
    )
  try {
    return (await run())[0] ?? null
  } catch (error) {
    // Same upgrade window loadUserAccess handles: the row select now includes
    // role/permissions/disabled, so on a pre-migration DB it 42703s. Heal and
    // retry once so API-key auth doesn't hard-fail while sessions self-heal.
    if (getPgCode(error) === "42703") {
      const { reapplySchema } = await import("@/lib/db/ensure-schema")
      if (await reapplySchema()) {
        return (await run())[0] ?? null
      }
    }
    throw error
  }
}

/**
 * Get authenticated user and database client for API routes.
 * Supports two auth methods:
 * 1. Better Auth session cookie (browser sessions)
 * 2. API key via x-api-key header (external applications)
 *
 * @returns Object with user, session, and withRLS (Drizzle helper)
 */
async function getAuthenticatedUserImpl() {
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
    // Disabled accounts and revoked sessions are rejected here even if the
    // session cookie is still cache-valid; permission grants always reflect
    // the live DB row.
    const access = await loadUserAccess(session.user.id, session.session.token)
    if (!access) return NULL_AUTH

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        role: access.role,
        permissions: access.permissions,
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

    // Fetch user record (heals on the pre-migration missing-column window)
    const userRow = await fetchApiKeyUserRow(keyRow.userId)
    if (!userRow) return NULL_AUTH

    // API keys of disabled accounts stop authenticating immediately.
    if (userRow.disabled === true) return NULL_AUTH
    const keyUserRole: UserRole = userRow.role === "admin" ? "admin" : "user"

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        role: keyUserRole,
        permissions: resolvePermissions(keyUserRole, userRow.permissions),
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
 * Authenticated user + RLS helper for server components and API routes.
 *
 * Wrapped in React.cache so multiple calls within the SAME server request
 * (e.g. the shared app/(app)/layout.tsx and the module catch-all page) share a
 * single session/DB lookup instead of repeating it. cache() memoizes per
 * request only, so behavior is otherwise identical to a direct call.
 */
export const getAuthenticatedUser = cache(getAuthenticatedUserImpl)

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
