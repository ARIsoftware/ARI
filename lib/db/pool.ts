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
  // Many concurrent lambdas × large pool = connection exhaustion on Supabase.
  const isProduction = process.env.NODE_ENV === "production"
  const defaultMax = isProduction ? 3 : 10

  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || String(defaultMax), 10),
    // Close idle connections quickly so they don't go stale while the lambda is warm.
    // Supabase's PgBouncer session pooler may close backend connections after its own
    // idle timeout — if our client-side timeout is longer, we hand out dead sockets.
    idleTimeoutMillis: isProduction ? 4000 : 10000,
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
    // TCP keepalive detects connections silently closed by PgBouncer / load balancers.
    // Without this, the pool can hand out dead sockets that fail with
    // "Connection terminated unexpectedly".
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: { rejectUnauthorized: false },
  })

  p.on("error", (err) => {
    console.warn("[DB Pool] Unexpected connection error (will auto-recover):", err.message)
  })

  return p
}

const pool = globalThis.__ariPgPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  globalThis.__ariPgPool = pool
}

export { pool }
