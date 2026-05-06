import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var __ariPgPool: Pool | null | undefined
}

function createPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null
  }

  // In serverless (Vercel), each lambda gets its own pool.
  // Many concurrent lambdas × large pool = connection exhaustion on the upstream Postgres.
  const isProduction = process.env.NODE_ENV === "production"
  const defaultMax = isProduction ? 3 : 10

  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || String(defaultMax), 10),
    // Close idle connections quickly so they don't go stale while the lambda is warm.
    // Hosted-Postgres connection poolers (e.g. Supabase's PgBouncer) close backend
    // connections after their own idle timeout — if our client-side timeout is longer,
    // we hand out dead sockets.
    idleTimeoutMillis: isProduction ? 4000 : 10000,
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
    // TCP keepalive detects connections silently closed by PgBouncer / load balancers.
    // Without this, the pool can hand out dead sockets that fail with
    // "Connection terminated unexpectedly".
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: process.env.DATABASE_URL?.includes("127.0.0.1") || process.env.DATABASE_URL?.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  })

  p.on("error", (err) => {
    console.warn("[DB Pool] Unexpected connection error (will auto-recover):", err.message)
  })

  addConnectionValidation(p)

  return p
}

/**
 * Monkey-patch pool.connect() to validate connections with a `SELECT 1` ping
 * before returning them. If the connection is stale (silently closed by
 * PgBouncer), destroy it and acquire a fresh one.
 *
 * This fixes stale-connection errors for ALL callers — including Better Auth's
 * internal Kysely queries, bootstrap, and withAdminDb — without requiring each
 * caller to implement its own retry logic.
 */
function addConnectionValidation(p: Pool): void {
  const originalConnect = p.connect.bind(p)

  p.connect = async function validatedConnect(callback?: any): Promise<any> {
    // If called with a callback, don't interfere (legacy pattern)
    if (typeof callback === 'function') return originalConnect(callback)

    const client = await originalConnect()
    try {
      await client.query('SELECT 1')
      return client
    } catch {
      // Connection is dead — destroy it so the pool doesn't reuse it
      try { client.release(true) } catch {}
      // Acquire a fresh connection (this one will be newly established)
      return await originalConnect()
    }
  } as any
}

const pool = globalThis.__ariPgPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  globalThis.__ariPgPool = pool
}

export { pool }
