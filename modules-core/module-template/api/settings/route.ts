/**
 * Module Template Module - Settings API Routes
 *
 * Endpoints:
 * - GET /api/modules/module-template/settings  - Get user's settings
 * - PUT /api/modules/module-template/settings  - Update user's settings (partial)
 *
 * The PUT does a single atomic upsert that merges the new keys into the
 * existing JSONB rather than overwriting it — so the settings panel and the
 * onboarding form can each save their own slice without clobbering the other.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { safeText } from '@/lib/validation'
import { z } from 'zod'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

// All fields are `.optional()` to support partial updates. `.strict()` rejects
// unknown keys so a typo or smuggled field can't land in the JSONB blob.
const SettingsSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  sampleQuestion1: safeText(500).optional(),
  sampleQuestion2: safeText(500).optional(),
  sampleQuestion3: safeText(500).optional(),
  enableNotifications: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),
  defaultMessage: safeText(500).optional(),
  userDisplayName: safeText(100).optional(),
  theme: z.enum(['light', 'dark', 'auto'], {
    errorMap: () => ({ message: 'Theme must be one of: light, dark, auto' }),
  }).optional(),
  refreshInterval: z.enum(['30', '60', '120'], {
    errorMap: () => ({ message: 'Refresh interval must be one of: 30, 60, 120 (seconds)' }),
  }).optional(),
}).strict()

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'module-template'))
        .limit(1)
    )

    return NextResponse.json(data[0]?.settings ?? {})

  } catch (error) {
    console.error('GET /api/modules/module-template/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, SettingsSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Atomic upsert + JSONB merge: `existing || EXCLUDED` keeps any prior keys
    // not present in the new payload. Relies on the unique constraint on
    // (user_id, module_id) in core-schema.ts.
    const patch = JSON.stringify(validation.data)
    await withRLS((db) =>
      db.insert(moduleSettings)
        .values({
          userId: user.id,
          moduleId: 'module-template',
          settings: validation.data,
        })
        .onConflictDoUpdate({
          target: [moduleSettings.userId, moduleSettings.moduleId],
          set: {
            settings: sql`COALESCE(${moduleSettings.settings}, '{}'::jsonb) || ${patch}::jsonb`,
            updatedAt: sql`timezone('utc'::text, now())`,
          },
        })
    )

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('PUT /api/modules/module-template/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
