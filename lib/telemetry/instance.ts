import { pool } from "@/lib/db/pool"

export interface AriInstance {
  id: string
  telemetryEnabled: boolean
}

/**
 * Read the singleton ari_instance row. Defensively inserts one if missing
 * (e.g. for installs that pre-date this table and never ran the migration).
 * Returns null if the DB is unreachable or the table doesn't exist yet.
 */
export async function getAriInstance(): Promise<AriInstance | null> {
  if (!pool) return null
  try {
    const { rows } = await pool.query<{ id: string; telemetry_enabled: boolean }>(
      'SELECT id, telemetry_enabled FROM "ari_instance" LIMIT 1'
    )
    if (rows.length > 0) {
      return { id: rows[0].id, telemetryEnabled: rows[0].telemetry_enabled }
    }
    const inserted = await pool.query<{ id: string; telemetry_enabled: boolean }>(
      'INSERT INTO "ari_instance" ("telemetry_enabled") VALUES (TRUE) RETURNING id, telemetry_enabled'
    )
    return { id: inserted.rows[0].id, telemetryEnabled: inserted.rows[0].telemetry_enabled }
  } catch {
    return null
  }
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (!pool) return
  await pool.query('UPDATE "ari_instance" SET "telemetry_enabled" = $1', [enabled])
}
