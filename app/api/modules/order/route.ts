/**
 * Module Order API
 *
 * GET /api/modules/order - Get user's custom ordering (module + icon + dashboard)
 * Returns: { iconOrder?, moduleOrder?, statCardOrder?, widgetOrder? }
 *
 * POST /api/modules/order - Save user's custom ordering
 * Body: { moduleOrder?, iconOrder?, statCardOrder?, widgetOrder? }
 *
 * Stores menuPriority in module_settings.settings JSONB column
 * Special module_ids for non-module orders:
 *   "__topbar_icons__" - top bar icon order
 *   "__dashboard_stat_cards__" - dashboard stat card order
 *   "__dashboard_widgets__" - dashboard widget order
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createDbClient } from '@/lib/db-supabase'
import { z } from 'zod'

const TOPBAR_ICONS_MODULE_ID = "__topbar_icons__"
const DASHBOARD_STAT_CARDS_MODULE_ID = "__dashboard_stat_cards__"
const DASHBOARD_WIDGETS_MODULE_ID = "__dashboard_widgets__"

const OrderSchema = z.object({
  moduleOrder: z.record(z.string(), z.number()).optional(),
  iconOrder: z.record(z.string(), z.number()).optional(),
  statCardOrder: z.record(z.string(), z.number()).optional(),
  widgetOrder: z.record(z.string(), z.number()).optional(),
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

    const specialIds = new Set([TOPBAR_ICONS_MODULE_ID, DASHBOARD_STAT_CARDS_MODULE_ID, DASHBOARD_WIDGETS_MODULE_ID])

    // Extract special orders
    const iconSettings = allSettings?.find(s => s.module_id === TOPBAR_ICONS_MODULE_ID)
    const iconOrder = iconSettings?.settings?.iconOrder || null

    const statCardSettings = allSettings?.find(s => s.module_id === DASHBOARD_STAT_CARDS_MODULE_ID)
    const statCardOrder = statCardSettings?.settings?.statCardOrder || null

    const widgetSettings = allSettings?.find(s => s.module_id === DASHBOARD_WIDGETS_MODULE_ID)
    const widgetOrder = widgetSettings?.settings?.widgetOrder || null

    // Build module order from all module settings that have menuPriority
    const moduleOrder: Record<string, number> = {}
    if (allSettings) {
      for (const setting of allSettings) {
        if (!specialIds.has(setting.module_id) && setting.settings?.menuPriority !== undefined) {
          moduleOrder[setting.module_id] = setting.settings.menuPriority
        }
      }
    }

    return NextResponse.json({
      iconOrder,
      moduleOrder: Object.keys(moduleOrder).length > 0 ? moduleOrder : null,
      statCardOrder,
      widgetOrder,
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

    const { moduleOrder, iconOrder, statCardOrder, widgetOrder } = parseResult.data
    const supabase = createDbClient()
    const userId = user.id

    // Helper: fetch existing settings, merge a key, upsert
    async function upsertSettingsKey(moduleId: string, settingsKey: string, value: unknown) {
      const { data: existing } = await supabase
        .from('module_settings')
        .select('settings')
        .eq('user_id', userId)
        .eq('module_id', moduleId)
        .single()

      const { error } = await supabase
        .from('module_settings')
        .upsert(
          {
            user_id: userId,
            module_id: moduleId,
            enabled: true,
            settings: { ...(existing?.settings || {}), [settingsKey]: value },
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,module_id' }
        )

      if (error) throw new Error(`Failed to update ${settingsKey} for ${moduleId}: ${error.message}`)
    }

    // Update module orders (each module gets its own menuPriority)
    if (moduleOrder) {
      for (const [moduleId, priority] of Object.entries(moduleOrder)) {
        try {
          await upsertSettingsKey(moduleId, 'menuPriority', priority)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[API /modules/order] ${message}`)
          return NextResponse.json({ error: message }, { status: 500 })
        }
      }
    }

    // Run independent special-key upserts in parallel
    const specialUpserts: Promise<void>[] = []
    if (iconOrder) specialUpserts.push(upsertSettingsKey(TOPBAR_ICONS_MODULE_ID, 'iconOrder', iconOrder))
    if (statCardOrder) specialUpserts.push(upsertSettingsKey(DASHBOARD_STAT_CARDS_MODULE_ID, 'statCardOrder', statCardOrder))
    if (widgetOrder) specialUpserts.push(upsertSettingsKey(DASHBOARD_WIDGETS_MODULE_ID, 'widgetOrder', widgetOrder))

    if (specialUpserts.length > 0) {
      try {
        await Promise.all(specialUpserts)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save order'
        console.error(`[API /modules/order] ${message}`)
        return NextResponse.json({ error: message }, { status: 500 })
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
