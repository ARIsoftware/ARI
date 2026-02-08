/**
 * Module Order API
 *
 * GET /api/modules/order - Get user's custom ordering (module + icon)
 * Returns: { iconOrder?: { [iconId: string]: number } }
 *
 * POST /api/modules/order - Save user's custom module and/or icon ordering
 * Body: { moduleOrder?: { [moduleId: string]: number }, iconOrder?: { [iconId: string]: number } }
 *
 * Stores menuPriority in module_settings.settings JSONB column
 * Icon order is stored with special module_id "__topbar_icons__"
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createDbClient } from '@/lib/db-supabase'
import { z } from 'zod'

const TOPBAR_ICONS_MODULE_ID = "__topbar_icons__"

const OrderSchema = z.object({
  moduleOrder: z.record(z.string(), z.number()).optional(),
  iconOrder: z.record(z.string(), z.number()).optional()
})

export async function GET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createDbClient()

    // Fetch all module settings for this user
    const { data: allSettings } = await supabase
      .from('module_settings')
      .select('module_id, settings')
      .eq('user_id', user.id)

    // Extract icon order from the special "__topbar_icons__" module_id
    const iconSettings = allSettings?.find(s => s.module_id === TOPBAR_ICONS_MODULE_ID)
    const iconOrder = iconSettings?.settings?.iconOrder || null

    // Build module order from all module settings that have menuPriority
    const moduleOrder: Record<string, number> = {}
    if (allSettings) {
      for (const setting of allSettings) {
        if (setting.module_id !== TOPBAR_ICONS_MODULE_ID && setting.settings?.menuPriority !== undefined) {
          moduleOrder[setting.module_id] = setting.settings.menuPriority
        }
      }
    }

    return NextResponse.json({
      iconOrder,
      moduleOrder: Object.keys(moduleOrder).length > 0 ? moduleOrder : null
    })
  } catch (error) {
    console.error('[API /modules/order GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

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

    const { moduleOrder, iconOrder } = parseResult.data
    const supabase = createDbClient()

    // Update module orders if provided
    if (moduleOrder) {
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
    }

    // Update icon order if provided
    if (iconOrder) {
      // Get existing settings for the topbar icons
      const { data: existing } = await supabase
        .from('module_settings')
        .select('settings')
        .eq('user_id', user.id)
        .eq('module_id', TOPBAR_ICONS_MODULE_ID)
        .single()

      // Store icon order in settings
      const newSettings = {
        ...(existing?.settings || {}),
        iconOrder
      }

      // Upsert the icon order settings
      const { error } = await supabase
        .from('module_settings')
        .upsert(
          {
            user_id: user.id,
            module_id: TOPBAR_ICONS_MODULE_ID,
            enabled: true,
            settings: newSettings,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'user_id,module_id'
          }
        )

      if (error) {
        console.error(`[API /modules/order] Failed to update icon order:`, error)
        return NextResponse.json(
          { error: 'Failed to update icon order' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /modules/order] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save order' },
      { status: 500 }
    )
  }
}
