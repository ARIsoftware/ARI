/**
 * Module Management API - All Modules
 *
 * GET /api/modules/all - List ALL discovered modules (regardless of enabled state)
 * This is used by the Settings page to show all modules for management
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getModules } from '@/lib/modules/module-registry'
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
    // Registry is generated at build time via npm run generate-module-registry
    const allModules = await getModules()

    // Log module list when /modules page is visited
    console.log(`[Modules] Viewing modules page - ${allModules.length} modules:`, allModules.map(m => m.id))

    const settings = await withRLS((db) =>
      db.select().from(moduleSettings).where(eq(moduleSettings.userId, user.id))
    )

    // Create a map of module_id -> enabled state
    const settingsMap = new Map<string, boolean>()
    if (settings) {
      settings.forEach((setting) => {
        settingsMap.set(setting.moduleId, setting.enabled ?? true)
      })
    }

    // Add isEnabled property to each module
    const modulesWithEnabledState = allModules.map(module => ({
      ...module,
      isEnabled: settingsMap.has(module.id)
        ? settingsMap.get(module.id)
        : (module.enabled ?? true)
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
