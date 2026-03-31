import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { type PoolClient } from 'pg'
import { pool } from './pool'

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
 * Execute database operations with RLS user context.
 *
 * CRITICAL: This sets the user context for RLS policies.
 * All queries within the callback will be filtered by user_id.
 *
 * IMPORTANT: For INSERT operations, you must still set user_id explicitly!
 * RLS validates that user_id matches current_user_id, but doesn't auto-populate it.
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
/**
 * Check if an error indicates a dead/stale connection (closed by PgBouncer
 * while the pool still held a reference to it).
 */
function isStaleConnectionError(error: any): boolean {
  const msg = error?.message || ''
  return (
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('Connection terminated due to connection timeout') ||
    msg.includes('connection is closed') ||
    msg.includes('Client has encountered a connection error')
  )
}

export async function withUserContext<T>(
  userId: string,
  operation: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!pool) {
    throw new Error('Database pool not initialized')
  }

  const attempt = async (isRetry: boolean): Promise<T> => {
    let client: PoolClient | null = null

    try {
      const rawClient = await pool.connect()
      client = pgBouncerCompat(rawClient)

      // Begin transaction - SET LOCAL only lasts within transaction
      await client.query('BEGIN')

      // Set user context for RLS policies
      // app.current_user_id() function reads this value
      // Note: SET doesn't support parameterized queries, so we escape manually
      // Escape single quotes to prevent SQL injection
      const escapedUserId = userId.replace(/'/g, "''")
      await client.query(`SET LOCAL app.current_user_id = '${escapedUserId}'`)

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
        return attempt(true)
      }

      throw error
    } finally {
      // Always release the client back to the pool
      if (client) client.release()
    }
  }

  return attempt(false)
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
 * Gracefully close the connection pool.
 * Call this during application shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
  }
}
