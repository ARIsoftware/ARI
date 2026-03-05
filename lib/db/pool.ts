import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var __ariPgPool: Pool | null | undefined
}

function createPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null
  }

  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || "10", 10),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
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
