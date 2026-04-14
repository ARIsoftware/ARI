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
import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
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
    // Fetch all module settings for this user
    const allSettings = await withAdminDb(async (db) =>
      db.select({ moduleId: moduleSettings.moduleId, settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.userId, user.id))
    )

    const specialIds = new Set([TOPBAR_ICONS_MODULE_ID, DASHBOARD_STAT_CARDS_MODULE_ID, DASHBOARD_WIDGETS_MODULE_ID])

    // Extract special orders
    const iconSettings = allSettings.find(s => s.moduleId === TOPBAR_ICONS_MODULE_ID)
    const iconOrder = (iconSettings?.settings as Record<string, any>)?.iconOrder || null

    const statCardSettings = allSettings.find(s => s.moduleId === DASHBOARD_STAT_CARDS_MODULE_ID)
    const statCardOrder = (statCardSettings?.settings as Record<string, any>)?.statCardOrder || null

    const widgetSettings = allSettings.find(s => s.moduleId === DASHBOARD_WIDGETS_MODULE_ID)
    const widgetOrder = (widgetSettings?.settings as Record<string, any>)?.widgetOrder || null

    // Build module order from all module settings that have menuPriority
    const moduleOrder: Record<string, number> = {}
    for (const setting of allSettings) {
      const settingsObj = setting.settings as Record<string, any> | null
      if (!specialIds.has(setting.moduleId) && settingsObj?.menuPriority !== undefined) {
        moduleOrder[setting.moduleId] = settingsObj.menuPriority
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
    const userId = user.id

    // Helper: read existing settings, merge a key, upsert — single connection to avoid races
    async function upsertSettingsKey(modId: string, settingsKey: string, value: unknown) {
      await withAdminDb(async (db) => {
        const existing = await db.select({ settings: moduleSettings.settings })
          .from(moduleSettings)
          .where(
            and(
              eq(moduleSettings.userId, userId),
              eq(moduleSettings.moduleId, modId)
            )
          )

        const merged = { ...((existing[0]?.settings as Record<string, any>) || {}), [settingsKey]: value }

        await db.insert(moduleSettings)
          .values({
            userId,
            moduleId: modId,
            enabled: true,
            settings: merged,
          })
          .onConflictDoUpdate({
            target: [moduleSettings.userId, moduleSettings.moduleId],
            set: {
              settings: merged,
              updatedAt: new Date().toISOString(),
            },
          })
      })
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
