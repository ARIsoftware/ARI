import { after } from 'next/server'
import { pool } from '@/lib/db/pool'

/**
 * Central activity log — writes one row to activity_log per event.
 *
 * Design constraints (see activity_log in lib/db/setup.sql):
 * - Zero request latency: the INSERT is scheduled via next/server's after(),
 *   so it runs once the response has been flushed to the client. Outside a
 *   request scope (e.g. some Better Auth hook contexts) it degrades to a
 *   floating promise — same pattern as recordApiKeyUsage().
 * - Never throws: a failed write logs to console and the request is unaffected.
 * - Single round trip: one parameterized INSERT on the shared pool. No RLS
 *   transaction — the table's INSERT is unrestricted for authenticated writes
 *   and reads are admin-only (enforced by the viewer's API route; the RLS
 *   policy is defense-in-depth).
 * - No secrets in metadata: callers must only pass key NAMES, labels,
 *   prefixes, field lists — never values.
 */
export interface ActivityEvent {
  /** Actor — the server-verified user id, never client input. */
  userId: string
  /** Stable machine-readable type, e.g. 'api_key_created'. */
  type: string
  /** Actor-neutral human summary, e.g. 'Updated profile information'. */
  description: string
  /** Where the event originated. Defaults to 'settings'. */
  source?: string
  /** Extra context. MUST NOT contain secret values. */
  metadata?: Record<string, unknown>
}

// user_email is denormalized at write time (resolved from "user" inside the
// same statement) so log rows are self-describing when read directly.
const INSERT_SQL = `INSERT INTO "activity_log" ("user_id", "user_email", "event_type", "source", "description", "metadata")
   VALUES ($1, (SELECT "email" FROM "user" WHERE "id" = $1), $2, $3, $4, $5::jsonb)`

// Same insert, but only when no event of this type already references the
// same metadata value (e.g. one api_key_expired per key, ever).
const INSERT_ONCE_SQL = `INSERT INTO "activity_log" ("user_id", "user_email", "event_type", "source", "description", "metadata")
   SELECT $1, (SELECT "email" FROM "user" WHERE "id" = $1), $2, $3, $4, $5::jsonb
   WHERE NOT EXISTS (
     SELECT 1 FROM "activity_log" WHERE "event_type" = $2 AND "metadata"->>$6 = $7
   )`

function eventParams(event: ActivityEvent): unknown[] {
  return [
    event.userId,
    event.type,
    event.source ?? 'settings',
    event.description,
    JSON.stringify(event.metadata ?? {}),
  ]
}

/**
 * Run the write after the response is sent; fall back to fire-and-forget when
 * called outside a request scope (after() throws there). Both paths swallow
 * errors — an activity-log failure must never affect the request.
 */
function schedule(work: () => Promise<unknown>): void {
  const run = () =>
    work().catch((err) => {
      console.error('Activity log write failed:', err)
    })
  try {
    after(run)
  } catch {
    void run()
  }
}

/** Record an activity event. Returns immediately; never throws. */
export function logActivity(event: ActivityEvent): void {
  schedule(async () => {
    if (!pool) return
    await pool.query(INSERT_SQL, eventParams(event))
  })
}

/**
 * Record an activity event at most once per (type, metadata[dedupeKey]) pair.
 * Used for detected states that would otherwise repeat on every request, e.g.
 * an expired API key being presented. dedupeKey must name a string field
 * present in event.metadata. Best-effort: two concurrent detections can both
 * pass the NOT EXISTS guard — acceptable for a rare, benign duplicate.
 */
export function logActivityOnce(event: ActivityEvent, dedupeKey: string): void {
  const dedupeValue = event.metadata?.[dedupeKey]
  if (typeof dedupeValue !== 'string' || dedupeValue === '') {
    console.error(`Activity log dedupe key "${dedupeKey}" missing from metadata; event dropped`)
    return
  }
  schedule(async () => {
    if (!pool) return
    await pool.query(INSERT_ONCE_SQL, [...eventParams(event), dedupeKey, dedupeValue])
  })
}
