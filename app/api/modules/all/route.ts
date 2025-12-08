/**
 * Module Management API - All Modules
 *
 * GET /api/modules/all - List ALL discovered modules (regardless of enabled state)
 * This is used by the Settings page to show all modules for management
 *
 * This endpoint also regenerates the module registry to ensure it's always up-to-date.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getModules } from '@/lib/modules/module-registry'
import { regenerateModuleRegistry } from '@/lib/modules/regenerate-registry'

/**
 * GET /api/modules/all
 * Returns ALL discovered modules (both enabled and disabled)
 * Used by Settings page to allow users to manage module state
 */
export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedUser()

  // Validate authentication
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Regenerate the module registry to ensure it's up-to-date
    await regenerateModuleRegistry()

    // Get ALL discovered modules (regardless of enabled state)
    const allModules = await getModules()

    // Get user's module settings from database to populate isEnabled
    const { data: settings } = await supabase
      .from('module_settings')
      .select('*')
      .eq('user_id', user.id)

    // Create a map of module_id -> enabled state
    const settingsMap = new Map<string, boolean>()
    if (settings) {
      settings.forEach((setting: any) => {
        settingsMap.set(setting.module_id, setting.enabled)
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
  } catch (error: any) {
    console.error('[API /modules/all] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load modules' },
      { status: 500 }
    )
  }
}
