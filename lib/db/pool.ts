import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var __ariPgPool: Pool | null | undefined
}

function createPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || "5", 10),
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  })
}

const pool = globalThis.__ariPgPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  globalThis.__ariPgPool = pool
}

if (pool) {
  pool.on("error", (err) => {
    console.warn("[DB Pool] Unexpected connection error (will auto-recover):", err.message)
  })
}

export { pool }
