/**
 * Server-only helpers for the Tasks API routes.
 */

import { userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { DrizzleDb } from '@/lib/db'

type WithRLS = <T>(operation: (db: DrizzleDb) => Promise<T>) => Promise<T>

/**
 * Resolve the user's IANA timezone from their Settings profile
 * (user_preferences.timezone), defaulting to UTC when unset or on error.
 * This is what makes "today" and the daily buckets mean the user's local day,
 * not the server's UTC day.
 */
export async function getUserTimeZone(withRLS: WithRLS, userId: string): Promise<string> {
  try {
    const rows = (await withRLS((db) =>
      db
        .select({ timezone: userPreferences.timezone })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1),
    )) as Array<{ timezone: string | null }>
    return rows[0]?.timezone || 'UTC'
  } catch {
    return 'UTC'
  }
}
