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
  })
  .strict()
  .openapi('DashboardSettings')

export const DashboardSettingsSavedSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi('DashboardSettingsSaved')
