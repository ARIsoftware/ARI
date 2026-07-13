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

/**
 * Force-reapply setup.sql even if it already ran this process.
 *
 * Used to self-heal at runtime when a query hits an undefined-column error
 * (e.g. a backup restore recreated a table from an older schema era). Unlike
 * ensureSchema(), this ignores the once-per-process latch. Returns true only
 * if setup.sql applied cleanly. Never throws.
 */
export async function reapplySchema(): Promise<boolean> {
  if (!pool) return false
  try {
    await pool.query(setupSql)
    ensured = true
    console.log("✅ Schema re-applied (lib/db/setup.sql)")
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("⚠️  Failed to re-apply lib/db/setup.sql:", msg)
    return false
  }
}
