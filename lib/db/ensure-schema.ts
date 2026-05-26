import { pool } from "@/lib/db/pool"
import { setupSql } from "@/lib/db/setup-sql"

let ensured = false

/**
 * Apply lib/db/setup.sql idempotently on server startup. Safe to call
 * repeatedly: only does real DB work on the first successful call per process.
 *
 * All errors are caught and logged — schema failures must NOT block startup.
 * If the call fails (e.g. DB unreachable), `ensured` stays false so a later
 * caller can retry.
 */
export async function ensureSchema(): Promise<void> {
  if (ensured) return
  if (!pool) return
  try {
    await pool.query(setupSql)
    ensured = true
    console.log("✅ Schema ensured (lib/db/setup.sql applied)")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("⚠️  Failed to apply lib/db/setup.sql:", msg)
  }
}
