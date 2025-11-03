/**
 * Get Enabled Modules API
 *
 * Returns list of modules that are enabled for the current user
 */

import { NextResponse } from 'next/server'
import { getEnabledModules } from '@/lib/modules/module-registry'

export async function GET() {
  try {
    // Get enabled modules for current user
    const modules = await getEnabledModules()

    return NextResponse.json({
      modules: modules.map(module => ({
        id: module.id,
        name: module.name,
        enabled: module.enabled
      }))
    })
  } catch (error: any) {
    console.error('[API] Error fetching enabled modules:', error)
    return NextResponse.json(
      { error: 'Failed to fetch enabled modules', details: error.message },
      { status: 500 }
    )
  }
}
