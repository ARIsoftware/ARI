/**
 * Debug endpoint to check module status
 *
 * Returns detailed information about why modules might not be loading
 * Used by /debug page to diagnose module issues
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { moduleSettings } from '@/lib/db/schema'
import { getModules } from '@/lib/modules/module-registry'
import { safeErrorResponse } from '@/lib/api-error'
import { eq } from 'drizzle-orm'

export const debugRole = "debug-module-status"

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({
        error: 'No authenticated user',
        authenticated: false
      })
    }

    const allModules = await getModules()

    // Get user's module settings
    const settings = await withRLS((db) =>
      db.select().from(moduleSettings).where(eq(moduleSettings.userId, user.id))
    )

    // Build a per-user enabled map: a module is enabled iff its manifest is
    // enabled AND the user hasn't explicitly disabled it.
    const userDisabled = new Set(
      settings
        .filter((s: any) => s.enabled === false)
        .map((s: any) => s.moduleId ?? s.module_id)
        .filter(Boolean)
    )

    const moduleChecks: Record<string, { exists: true; enabled: boolean }> = {}
    for (const m of allModules) {
      moduleChecks[m.id] = {
        exists: true,
        enabled: m.enabled !== false && !userDisabled.has(m.id),
      }
    }

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      allModules: allModules.map(m => ({ id: m.id, enabled: m.enabled })),
      userSettings: settings,
      moduleChecks,
    })
  } catch (error: any) {
    console.error('[Debug] Module status error:', error)
    return NextResponse.json({
      error: safeErrorResponse(error)
    }, { status: 500 })
  }
}
