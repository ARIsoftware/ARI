/**
 * Theme API
 *
 * GET /api/theme - Get user's theme settings
 * PUT /api/theme - Update user's theme settings
 *
 * Stores theme settings in module_settings table with moduleId = "theme-system"
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { eq, and } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema'
import { z } from 'zod'
import { DEFAULT_THEME_ID } from '@/lib/theme/presets'
import { DEFAULT_FONT_ID } from '@/lib/theme/fonts'
import type { ThemeSettings, CustomTheme, ThemeColors, SidebarView } from '@/lib/theme/types'
import { ThemeSettingsSchema, updateThemeSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

const THEME_MODULE_ID = 'theme-system'

registry.registerPath({
  method: 'get',
  path: '/api/theme',
  operationId: 'getTheme',
  summary: "Get the user's theme settings (active theme, font, custom themes, sidebar view)",
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Theme settings', content: { 'application/json': { schema: ThemeSettingsSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/theme',
  operationId: 'updateTheme',
  summary: "Update the user's theme settings (merged with existing)",
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: updateThemeSchema } } } },
  responses: {
    200: { description: 'Updated theme settings', content: { 'application/json': { schema: ThemeSettingsSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

// Schema for theme colors
const ThemeColorsSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  card: z.string(),
  cardForeground: z.string(),
  popover: z.string(),
  popoverForeground: z.string(),
  primary: z.string(),
  primaryForeground: z.string(),
  secondary: z.string(),
  secondaryForeground: z.string(),
  muted: z.string(),
  mutedForeground: z.string(),
  accent: z.string(),
  accentForeground: z.string(),
  destructive: z.string(),
  destructiveForeground: z.string(),
  border: z.string(),
  input: z.string(),
  ring: z.string(),
  chart1: z.string(),
  chart2: z.string(),
  chart3: z.string(),
  chart4: z.string(),
  chart5: z.string(),
  sidebarBackground: z.string(),
  sidebarForeground: z.string(),
  sidebarPrimary: z.string(),
  sidebarPrimaryForeground: z.string(),
  sidebarAccent: z.string(),
  sidebarAccentForeground: z.string(),
  sidebarBorder: z.string(),
  sidebarRing: z.string(),
  radius: z.string(),
})

// Schema for custom theme
const CustomThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['light', 'dark']),
  colors: ThemeColorsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

// Schema for sidebar view
const SidebarViewSchema = z.enum(['default', 'compressed'])

// Schema for updating theme settings
const UpdateThemeSettingsSchema = z.object({
  activeThemeId: z.string().optional(),
  activeFont: z.string().optional(),
  customThemes: z.array(CustomThemeSchema).optional(),
  sidebarView: SidebarViewSchema.optional(),
})

// Default theme settings
const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  activeThemeId: DEFAULT_THEME_ID,
  activeFont: DEFAULT_FONT_ID,
  customThemes: [],
  sidebarView: 'default',
}

/**
 * GET /api/theme
 * Returns user's theme settings
 */
export async function GET() {
  const { user, withRLS } = await getAuthenticatedUser()

  if (!user || !withRLS) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await withRLS((db) =>
      db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(
          and(
            eq(moduleSettings.userId, user.id),
            eq(moduleSettings.moduleId, THEME_MODULE_ID)
          )
        )
        .limit(1)
    )

    if (result.length === 0 || !result[0].settings) {
      return NextResponse.json(DEFAULT_THEME_SETTINGS)
    }

    const settings = result[0].settings as Record<string, unknown>

    // Merge with defaults to ensure all fields are present
    const themeSettings: ThemeSettings = {
      activeThemeId: (settings.activeThemeId as string) || DEFAULT_THEME_SETTINGS.activeThemeId,
      activeFont: (settings.activeFont as string) || DEFAULT_THEME_SETTINGS.activeFont,
      customThemes: (settings.customThemes as CustomTheme[]) || DEFAULT_THEME_SETTINGS.customThemes,
      sidebarView: (settings.sidebarView as 'default' | 'compressed') || DEFAULT_THEME_SETTINGS.sidebarView,
    }

    return NextResponse.json(themeSettings)
  } catch (error) {
    console.error('[API /theme GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get theme settings' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/theme
 * Updates user's theme settings
 */
export async function PUT(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()

  if (!user || !withRLS) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parseResult = UpdateThemeSettingsSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const updates = parseResult.data

    // Read + write in a single connection to reduce pool pressure
    const newSettings = await withRLS(async (db) => {
      const existingResult = await db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(
          and(
            eq(moduleSettings.userId, user.id),
            eq(moduleSettings.moduleId, THEME_MODULE_ID)
          )
        )
        .limit(1)

      const existingSettings = (existingResult[0]?.settings || {}) as Record<string, unknown>

      const merged: ThemeSettings = {
        activeThemeId: updates.activeThemeId ?? (existingSettings.activeThemeId as string) ?? DEFAULT_THEME_SETTINGS.activeThemeId,
        activeFont: updates.activeFont ?? (existingSettings.activeFont as string) ?? DEFAULT_THEME_SETTINGS.activeFont,
        customThemes: updates.customThemes ?? (existingSettings.customThemes as CustomTheme[]) ?? DEFAULT_THEME_SETTINGS.customThemes,
        sidebarView: updates.sidebarView ?? (existingSettings.sidebarView as 'default' | 'compressed') ?? DEFAULT_THEME_SETTINGS.sidebarView,
      }

      if (existingResult.length === 0) {
        await db.insert(moduleSettings).values({
          userId: user.id,
          moduleId: THEME_MODULE_ID,
          enabled: true,
          settings: merged,
        })
      } else {
        await db
          .update(moduleSettings)
          .set({
            settings: merged,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(moduleSettings.userId, user.id),
              eq(moduleSettings.moduleId, THEME_MODULE_ID)
            )
          )
      }

      return merged
    })

    return NextResponse.json(newSettings)
  } catch (error) {
    console.error('[API /theme PUT] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update theme settings' },
      { status: 500 }
    )
  }
}
