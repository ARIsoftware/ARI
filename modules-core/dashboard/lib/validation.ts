import { z } from 'zod'
import '@/lib/openapi/registry'

export const DASHBOARD_LAYOUTS = ['default', 'boxy'] as const
export type DashboardLayout = (typeof DASHBOARD_LAYOUTS)[number]

export const DashboardSettingsSchema = z
  .object({
    layout: z
      .enum(DASHBOARD_LAYOUTS, {
        errorMap: () => ({ message: "Layout must be 'default' or 'boxy'" }),
      })
      .optional(),
    // Card keys hidden on the dashboard (see lib/cards.ts for the key format),
    // shared by every layout. Unset means "use the defaults"; an empty list
    // means "show everything". The PUT replaces the whole list.
    hiddenCards: z.array(z.string().min(1).max(120)).max(200).optional(),
  })
  .strict()
  .openapi('DashboardSettings')

export const DashboardSettingsSavedSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi('DashboardSettingsSaved')
