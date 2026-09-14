import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { type PoolClient } from 'pg'
import { pool } from './pool'
import {
  closeAppPool,
  getAppPoolIfHealthy,
  noteAppPoolConnectFailure,
  noteAppPoolServed,
  noteFallback,
  noteGrantMissRetry,
} from './app-pool'
import { ensureAppGrants } from './app-role'
import { getErrorMessages, getPgError } from './postgres-error'

// Type for the Drizzle database instance
export type DrizzleDb = NodePgDatabase<Record<string, never>>

/**
 * Wrap a pg client to strip prepared statement names from queries.
 * PgBouncer in transaction mode rotates backend connections between transactions,
 * so named prepared statements from a previous transaction may not exist on the
 * new connection. Stripping the `name` property forces pg to use unnamed statements.
 */
function pgBouncerCompat(client: PoolClient): PoolClient {
  const originalQuery = client.query.bind(client)
  client.query = function patchedQuery(...args: any[]) {
    // query(config, values?, callback?) — config is an object with `name`
    if (args[0] && typeof args[0] === 'object' && 'name' in args[0]) {
      args[0] = { ...args[0], name: undefined }
    }
    return (originalQuery as any)(...args)
  } as any
  return client
}

/**
 * Check if an error indicates a dead/stale connection (closed by PgBouncer
 * while the pool still held a reference to it). Drizzle wraps pg errors in
 * DrizzleQueryError ("Failed query: …" with the real error on `cause`), so
 * every message along the cause chain is checked.
 */
function isStaleConnectionError(error: any): boolean {
  return getErrorMessages(error).some(
    (msg) =>
      msg.includes('Connection terminated unexpectedly') ||
      msg.includes('Connection terminated due to connection timeout') ||
      msg.includes('connection is closed') ||
      msg.includes('Client has encountered a connection error')
  )
}

/**
 * SQLSTATE 42501 is shared by two very different errors:
 *   - `permission denied for table …` — a table created after the last grant
 *     sweep (module install, backup restore) that the app role cannot see yet;
 *   - `new row violates row-level security policy …` — an RLS WITH CHECK
 *     denial, i.e. exactly what enforcement is for.
 * Only the first is ever retried, and only on the app pool. Matching on the
 * code alone would silently re-run rejected writes. Reads through Drizzle's
 * wrapper (the SQLSTATE and message live on `cause`).
 */
export function isGrantMissError(error: unknown): boolean {
  const pg = getPgError(error)
  return (
    !!pg &&
    pg.code === '42501' &&
    typeof pg.message === 'string' &&
    /^permission denied for (table|relation|schema|function|sequence|view)\b/i.test(pg.message)
  )
}

/**
 * Execute database operations with RLS user context.
 *
 * CRITICAL: This sets the user context for RLS policies.
 * All queries within the callback will be filtered by user_id.
 *
 * IMPORTANT: For INSERT operations, you must still set user_id explicitly!
 * RLS validates that user_id matches current_user_id, but doesn't auto-populate it.
 *
 * Runs on the non-BYPASSRLS app pool (lib/db/app-pool.ts) whenever it is
 * healthy, so Postgres enforces the policies; otherwise on the privileged
 * pool exactly as before (defense-in-depth only). The choice is made once,
 * when the connection is acquired — an operation's outcome never moves it to
 * the privileged pool.
 *
 * @example
 * ```ts
 * const tasks = await withUserContext(userId, async (db) => {
 *   return db.select().from(tasks)
 *   // No .where() needed for SELECT - RLS handles filtering
 * })
 * ```
 *
 * @example
 * ```ts
 * // For INSERT, you MUST set user_id
 * await withUserContext(userId, async (db) => {
 *   return db.insert(tasks).values({
 *     title: 'New task',
 *     user_id: userId, // Required!
 *   })
 * })
 * ```
 */
export async function withUserContext<T>(
  userId: string,
  operation: (db: DrizzleDb) => Promise<T>,
  role?: string
): Promise<T> {
  if (!pool) {
    throw new Error('Database pool not initialized')
  }

  const privileged = pool // narrowed to non-null by the guard above
  const attempt = async (isRetry: boolean, grantSwept: boolean): Promise<T> => {
    let client: PoolClient | null = null
    let enforced = false

    try {
      // Pool selection — connection level only.
      const appPool = await getAppPoolIfHealthy()
      let rawClient: PoolClient
      if (appPool) {
        try {
          rawClient = await appPool.connect()
          enforced = true
        } catch (connectError) {
          // Snoozes the app pool (and repairs the role on 28P01/28000);
          // this call runs on the privileged pool.
          noteAppPoolConnectFailure(connectError, userId)
          rawClient = await privileged.connect()
        }
        if (enforced) noteAppPoolServed(userId)
      } else {
        noteFallback(userId)
        rawClient = await privileged.connect()
      }
      client = pgBouncerCompat(rawClient)

      // Begin transaction - SET LOCAL only lasts within transaction
      await client.query('BEGIN')

      // Set user context for RLS policies
      // app.current_user_id() function reads this value
      // Note: SET doesn't support parameterized queries, so we escape manually
      // Escape single quotes to prevent SQL injection
      const escapedUserId = userId.replace(/'/g, "''")
      // app.current_user_role backs admin-only policies (e.g. activity_log
      // SELECT). Batched into the same round trip as the user id; when absent,
      // current_setting('app.current_user_role', true) is NULL → not admin.
      let setContext = `SET LOCAL app.current_user_id = '${escapedUserId}'`
      if (role) {
        const escapedRole = role.replace(/'/g, "''")
        setContext += `; SET LOCAL app.current_user_role = '${escapedRole}'`
      }
      // app.enforced arms the ownership-immutability trigger on shared
      // tables (lib/db/setup.sql). Set ONLY on the app pool, so the trigger
      // activates exactly with enforcement and the kill switch disables both.
      if (enforced) {
        setContext += `; SET LOCAL app.enforced = 'on'`
      }
      await client.query(setContext)

      // Create Drizzle instance for this connection
      const db = drizzle(client as PoolClient)

      // Execute the operation
      const result = await operation(db)

      // Commit transaction
      await client.query('COMMIT')

      return result
    } catch (error) {
      // Rollback on any error (skip if we never got a connection)
      if (client) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          // Rollback will also fail on a dead connection — that's expected
        }
      }

      // If this was a stale connection (killed by PgBouncer while idle),
      // destroy it so the pool doesn't reuse it, then retry once.
      if (!isRetry && isStaleConnectionError(error)) {
        if (client) client.release(true) // true = destroy, don't return to pool
        client = null // prevent double-release in finally
        return attempt(true, grantSwept)
      }

      // A table the app role has not been granted yet (created after the last
      // sweep): sweep synchronously and retry ONCE — on the app pool again.
      // RLS denials share SQLSTATE 42501 but never match isGrantMissError.
      if (enforced && !grantSwept && isGrantMissError(error)) {
        if (client) client.release()
        client = null
        noteGrantMissRetry()
        await ensureAppGrants()
        return attempt(isRetry, true)
      }

      throw error
    } finally {
      // Always release the client back to the pool
      if (client) client.release()
    }
  }

  return attempt(false, false)
}

/**
 * ADMIN ONLY: For operations that don't need user context.
 *
 * WARNING: This bypasses RLS if connected as a role with BYPASSRLS!
 * For user data, ALWAYS use withUserContext() or the auth helper's withRLS().
 *
 * Use cases:
 * - Backup/export operations (admin only)
 * - Database migrations
 * - One-time scripts
 *
 * @example
 * ```ts
 * // Admin backup operation
 * const allTables = await withAdminDb(async (db) => {
 *   return db.execute(sql`SELECT * FROM pg_tables`)
 * })
 * ```
 */
export async function withAdminDb<T>(
  operation: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!pool) {
    throw new Error('Database pool not initialized')
  }

  const p = pool // narrowed to non-null by the guard above
  const attempt = async (isRetry: boolean): Promise<T> => {
    const rawClient = await p.connect()
    const client = pgBouncerCompat(rawClient)

    try {
      const db = drizzle(client as PoolClient)
      return await operation(db)
    } catch (error) {
      if (!isRetry && isStaleConnectionError(error)) {
        client.release(true) // destroy dead connection
        return attempt(true)
      }
      throw error
    } finally {
      // release() after release(true) is a no-op in pg, safe to call
      try { client.release() } catch {}
    }
  }

  return attempt(false)
}

/**
 * Get a raw database connection for advanced operations.
 * Caller is responsible for releasing the connection.
 *
 * @deprecated Prefer withUserContext() or withAdminDb() for most use cases.
 */
export async function getPoolClient(): Promise<PoolClient> {
  if (!pool) {
    throw new Error('Database pool not initialized')
  }

  return pool.connect() as Promise<PoolClient>
}

/**
 * Gracefully close the connection pools (privileged + app role).
 * Call this during application shutdown.
 */
export async function closePool(): Promise<void> {
  await closeAppPool()
  if (pool) {
    await pool.end()
  }
}
