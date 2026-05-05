/**
 * Module Management API - All Modules
 *
 * GET /api/modules/all - List ALL discovered modules (regardless of enabled state)
 * This is used by the Settings page to show all modules for management
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getModules, bootstrapModuleSettings } from '@/lib/modules/module-registry'

export const debugRole = "modules-list-all"
import { moduleSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * GET /api/modules/all
 * Returns ALL discovered modules (both enabled and disabled)
 * Used by Settings page to allow users to manage module state
 */
export async function GET(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()

  // Validate authentication
  if (!user || !withRLS) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Get ALL discovered modules (regardless of enabled state)
    // Registry is generated at build time via pnpm run generate-module-registry
    const allModules = await getModules()

    const settings = await withRLS((db) =>
      db.select().from(moduleSettings).where(eq(moduleSettings.userId, user.id))
    )

    // Create a map of module_id -> enabled state
    const settingsMap = new Map<string, boolean>()
    if (settings) {
      settings.forEach((setting) => {
        settingsMap.set(setting.moduleId, setting.enabled ?? false)
      })
    }

    // Bootstrap: seed DB records for newly discovered modules
    const existingIds = new Set(settingsMap.keys())
    const unseeded = allModules.filter(m => !existingIds.has(m.id) && !m.isOverridden)
    if (unseeded.length > 0) {
      await bootstrapModuleSettings(user.id, allModules, existingIds)
      // Re-read from DB after bootstrap (don't assume defaults)
      const refreshed = await withRLS((db) =>
        db.select().from(moduleSettings).where(eq(moduleSettings.userId, user.id))
      )
      settingsMap.clear()
      refreshed?.forEach((s) => settingsMap.set(s.moduleId, s.enabled ?? false))
    }

    // Add isEnabled property — DB is sole source of truth, default disabled
    const modulesWithEnabledState = allModules.map(module => ({
      ...module,
      isEnabled: settingsMap.get(module.id) ?? false
    }))

    return NextResponse.json({
      modules: modulesWithEnabledState,
      count: modulesWithEnabledState.length
    })
  } catch (error: unknown) {
    console.error('[API /modules/all] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load modules' },
      { status: 500 }
    )
  }
}
