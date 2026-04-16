/**
 * Debug endpoint to verify RLS policies are actually enforcing row isolation.
 *
 * Performs an end-to-end test using the `module_settings` table (which has
 * proper per-user RLS policies). Works even on a fresh install with no
 * existing data — uses a temporary sentinel row that is always cleaned up.
 *
 * Positive test: current user's context can SELECT their own inserted row.
 * Negative test: a different user's context sees 0 rows for that sentinel
 * (proving RLS actually filters, not just relies on WHERE clauses).
 *
 * Used by /debug page when no module has user-scoped data to probe.
 */

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { withUserContext } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { safeErrorResponse } from '@/lib/api-error'
import { and, eq } from 'drizzle-orm'

export const debugRole = "debug-rls-test"

// Sentinel module_id used exclusively by this diagnostic. Chosen to be
// visually obvious and unlikely to collide with any real module id.
const SENTINEL_MODULE_ID = '__debug_rls_test__'

// POST (not GET) because this endpoint mutates the database (INSERT/DELETE on
// module_settings). Using POST matches REST semantics and blocks trivial CSRF
// via <img>/<link> tags that only issue GET. The auth cookie's SameSite=Lax
// already blocks cross-site POSTs, so this gives defense in depth.
export async function POST() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({
        authenticated: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Per-request fake user id for the negative test. Generated with a
    // cryptographically secure random suffix so it cannot collide with any
    // real Better Auth user id or leak across requests.
    const fakeUserId = `__debug_rls_fake_user_${randomBytes(16).toString('hex')}__`

    // Clean up any leftover sentinel row from a previous aborted run before
    // inserting — otherwise the unique (user_id, module_id) constraint fires.
    await withRLS((db) =>
      db.delete(moduleSettings).where(
        and(
          eq(moduleSettings.userId, user.id),
          eq(moduleSettings.moduleId, SENTINEL_MODULE_ID)
        )
      )
    )

    let insertedRowId: string | null = null
    try {
      // Step 1: INSERT a sentinel row via the current user's RLS context.
      // RLS's WITH CHECK clause rejects this if user_id doesn't match
      // app.current_user_id — so success proves the context was set.
      const inserted = await withRLS((db) =>
        db.insert(moduleSettings).values({
          userId: user.id,
          moduleId: SENTINEL_MODULE_ID,
          enabled: false,
          settings: { debugRlsTest: true }
        }).returning({ id: moduleSettings.id })
      )
      insertedRowId = inserted[0]?.id ?? null

      // Step 2 (positive): current user SELECT should return the sentinel.
      const positiveRows = await withRLS((db) =>
        db.select().from(moduleSettings).where(
          eq(moduleSettings.moduleId, SENTINEL_MODULE_ID)
        )
      )
      const positivePass =
        positiveRows.length === 1 &&
        positiveRows[0].userId === user.id

      // Step 3 (negative): a different user's context must see 0 sentinel rows.
      // If RLS were misconfigured (or bypassed) this would leak our row.
      const negativeRows = await withUserContext(fakeUserId, (db) =>
        db.select().from(moduleSettings).where(
          eq(moduleSettings.moduleId, SENTINEL_MODULE_ID)
        )
      )
      const negativePass = negativeRows.length === 0

      const allPass = positivePass && negativePass

      return NextResponse.json({
        authenticated: true,
        userId: user.id,
        success: allPass,
        positiveTest: {
          description: 'Current user can see their own inserted row',
          rowCount: positiveRows.length,
          allOwnedByCurrentUser:
            positiveRows.length > 0 &&
            positiveRows.every((r: any) => r.userId === user.id),
          passed: positivePass
        },
        negativeTest: {
          description: 'A different user context sees 0 of this user\'s rows',
          fakeUserContext: fakeUserId,
          rowCount: negativeRows.length,
          passed: negativePass
        },
        tableTested: 'module_settings',
        note: 'End-to-end RLS check using a sentinel row — works on fresh installs with no real data'
      })
    } finally {
      // Always clean up the sentinel row, even if an assertion failed above.
      if (insertedRowId) {
        try {
          await withRLS((db) =>
            db.delete(moduleSettings).where(eq(moduleSettings.id, insertedRowId!))
          )
        } catch (cleanupError) {
          console.error('[Debug RLS] Failed to clean up sentinel row:', cleanupError)
        }
      }
    }
  } catch (error: unknown) {
    console.error('[Debug RLS] Test failed:', error)
    return NextResponse.json({
      error: safeErrorResponse(error)
    }, { status: 500 })
  }
}
