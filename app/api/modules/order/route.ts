/**
 * Module Order API
 *
 * POST /api/modules/order - Save user's custom module ordering
 * Body: { moduleOrder: { [moduleId: string]: number } }
 *
 * Stores menuPriority in module_settings.settings JSONB column
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createDbClient } from '@/lib/db-supabase'
import { z } from 'zod'

const OrderSchema = z.object({
  moduleOrder: z.record(z.string(), z.number())
})

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parseResult = OrderSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error },
        { status: 400 }
      )
    }

    const { moduleOrder } = parseResult.data
    const supabase = createDbClient()

    // Update each module's settings with the new menuPriority
    for (const [moduleId, priority] of Object.entries(moduleOrder)) {
      // First, get existing settings for this module
      const { data: existing } = await supabase
        .from('module_settings')
        .select('settings')
        .eq('user_id', user.id)
        .eq('module_id', moduleId)
        .single()

      // Merge new menuPriority with existing settings
      const newSettings = {
        ...(existing?.settings || {}),
        menuPriority: priority
      }

      // Upsert the module settings
      const { error } = await supabase
        .from('module_settings')
        .upsert(
          {
            user_id: user.id,
            module_id: moduleId,
            enabled: true, // Keep module enabled
            settings: newSettings,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'user_id,module_id'
          }
        )

      if (error) {
        console.error(`[API /modules/order] Failed to update ${moduleId}:`, error)
        return NextResponse.json(
          { error: `Failed to update module order for ${moduleId}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /modules/order] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save module order' },
      { status: 500 }
    )
  }
}
