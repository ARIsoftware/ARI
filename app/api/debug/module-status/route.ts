/**
 * Debug endpoint to check module status
 *
 * Returns detailed information about why modules might not be loading
 * Used by /debug page to diagnose module issues
 */

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createDbClient } from '@/lib/db-supabase'
import { getModules, getEnabledModule } from '@/lib/modules/module-registry'

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) {
      return NextResponse.json({
        error: 'No authenticated user',
        authenticated: false
      })
    }

    const user = session.user
    const supabase = createDbClient()

    // Get all modules
    const allModules = await getModules()

    // Get user's module settings
    const { data: settings } = await supabase
      .from('module_settings')
      .select('*')
      .eq('user_id', user.id)

    // Check specific modules
    const contactsModule = await getEnabledModule('contacts')
    const winterArcModule = await getEnabledModule('winter-arc')
    const majorProjectsModule = await getEnabledModule('major-projects')

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      allModules: allModules.map(m => ({ id: m.id, enabled: m.enabled })),
      userSettings: settings || [],
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
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
