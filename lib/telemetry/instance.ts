import { pool } from "@/lib/db/pool"

export interface AriInstance {
  id: string
  telemetryEnabled: boolean
  firstSigninPinged: boolean
}

/**
 * Read the singleton ari_instance row. Defensively inserts one if missing
 * (e.g. for installs that pre-date this table and never ran the migration).
 * Returns null if the DB is unreachable or the table doesn't exist yet.
 */
type AriInstanceRow = { id: string; telemetry_enabled: boolean; first_signin_pinged: boolean }

const mapRow = (r: AriInstanceRow): AriInstance => ({
  id: r.id,
  telemetryEnabled: r.telemetry_enabled,
  firstSigninPinged: r.first_signin_pinged,
})

export async function getAriInstance(): Promise<AriInstance | null> {
  if (!pool) return null
  try {
    const { rows } = await pool.query<AriInstanceRow>(
      'SELECT id, telemetry_enabled, first_signin_pinged FROM "ari_instance" LIMIT 1'
    )
    if (rows.length > 0) return mapRow(rows[0])
    const inserted = await pool.query<AriInstanceRow>(
      'INSERT INTO "ari_instance" ("telemetry_enabled") VALUES (TRUE) RETURNING id, telemetry_enabled, first_signin_pinged'
    )
    return mapRow(inserted.rows[0])
  } catch {
    return null
  }
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (!pool) return
  await pool.query('UPDATE "ari_instance" SET "telemetry_enabled" = $1', [enabled])
}

/**
 * Atomic compare-and-set: flip first_signin_pinged from FALSE to TRUE.
 * Returns true only if this call won the race (the flag was FALSE and is
 * now TRUE). Callers should send the first-login ping only when this
 * returns true — prevents duplicate pings under concurrent sign-ins.
 */
export async function tryClaimFirstSigninPing(): Promise<boolean> {
  if (!pool) return false
  try {
    const { rows } = await pool.query<{ id: string }>(
      'UPDATE "ari_instance" SET "first_signin_pinged" = TRUE WHERE "first_signin_pinged" = FALSE RETURNING id'
    )
    return rows.length > 0
  } catch {
    return false
  }
}
