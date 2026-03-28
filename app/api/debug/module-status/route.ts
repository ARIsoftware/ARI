/**
 * Debug endpoint to check module status
 *
 * Returns detailed information about why modules might not be loading
 * Used by /debug page to diagnose module issues
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { moduleSettings } from '@/lib/db/schema'
import { getModules, getEnabledModule } from '@/lib/modules/module-registry'
import { safeErrorResponse } from '@/lib/api-error'
import { eq } from 'drizzle-orm'

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({
        error: 'No authenticated user',
        authenticated: false
      })
    }

    // Get all modules
    const allModules = await getModules()

    // Get user's module settings
    const settings = await withRLS((db) =>
      db.select().from(moduleSettings).where(eq(moduleSettings.userId, user.id))
    )

    // Check specific modules
    const contactsModule = await getEnabledModule('contacts')
    const winterArcModule = await getEnabledModule('winter-arc')
    const majorProjectsModule = await getEnabledModule('major-projects')

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      allModules: allModules.map(m => ({ id: m.id, enabled: m.enabled })),
      userSettings: settings,
      moduleChecks: {
        contacts: {
          exists: allModules.some(m => m.id === 'contacts'),
          enabled: !!contactsModule,
          module: contactsModule
        },
        'winter-arc': {
          exists: allModules.some(m => m.id === 'winter-arc'),
          enabled: !!winterArcModule,
          module: winterArcModule
        },
        'major-projects': {
          exists: allModules.some(m => m.id === 'major-projects'),
          enabled: !!majorProjectsModule,
          module: majorProjectsModule
        }
      }
    })
  } catch (error: any) {
    console.error('[Debug] Module status error:', error)
    return NextResponse.json({
      error: safeErrorResponse(error)
    }, { status: 500 })
  }
}
