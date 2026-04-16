/**
 * Get Enabled Modules API
 *
 * Returns list of modules that are enabled for the current user
 */

import { NextResponse } from 'next/server'
import { getEnabledModules } from '@/lib/modules/module-registry'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function GET() {
  try {
    // Require authentication
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get enabled modules for current user
    const modules = await getEnabledModules()

    return NextResponse.json({
      modules: modules.map(module => ({
        id: module.id,
        name: module.name,
        enabled: module.enabled
      }))
    })
  } catch (error: unknown) {
    console.error('[API] Error fetching enabled modules:', error)
    return NextResponse.json(
      { error: 'Failed to fetch enabled modules', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
