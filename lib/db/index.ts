import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'

// Connection pool for serverless environment
// Uses Supabase connection pooler (port 6543) for optimal performance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// Type for the Drizzle database instance
export type DrizzleDb = ReturnType<typeof drizzle>

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
export async function withUserContext<T>(
  userId: string,
  operation: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  const client = await pool.connect()

  try {
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
    // Rollback on any error
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError)
    }
    throw error
  } finally {
    // Always release the client back to the pool
    client.release()
  }
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
  const client = await pool.connect()

  try {
    const db = drizzle(client as PoolClient)
    return await operation(db)
  } finally {
    client.release()
  }
}

/**
 * Get a raw database connection for advanced operations.
 * Caller is responsible for releasing the connection.
 *
 * @deprecated Prefer withUserContext() or withAdminDb() for most use cases.
 */
export async function getPoolClient(): Promise<PoolClient> {
  return pool.connect() as Promise<PoolClient>
}

/**
 * Gracefully close the connection pool.
 * Call this during application shutdown.
 */
export async function closePool(): Promise<void> {
  await pool.end()
}
