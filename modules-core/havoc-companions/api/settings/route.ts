/**
 * Havoc Companions Module — Settings API
 *
 * GET  /api/modules/havoc-companions/settings  → fetch user's settings (or {})
 * PUT  /api/modules/havoc-companions/settings  → upsert user's settings (partial-merge)
 *
 * Settings are stored in the shared `module_settings` table's JSONB column,
 * keyed by (user_id, module_id). No dedicated table is needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { moduleSettings } from '@/lib/db/schema'
import {
  HavocSettingsSchema as SettingsSchema,
  SaveSuccessSchema,
} from '@/modules/havoc-companions/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

const MODULE_ID = 'havoc-companions'

registry.registerPath({
  method: 'get',
  path: '/api/modules/havoc-companions/settings',
  operationId: 'getHavocSettings',
  summary: "Fetch the authenticated user's Havoc Companions settings (or empty object)",
  tags: ['havoc-companions'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings object (all fields optional)', content: { 'application/json': { schema: SettingsSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/havoc-companions/settings',
  operationId: 'updateHavocSettings',
  summary: 'Partial-merge update of Havoc Companions settings',
  tags: ['havoc-companions'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: SettingsSchema } } } },
  responses: {
    200: { description: 'Settings saved', content: { 'application/json': { schema: SaveSuccessSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const rows = await withRLS((db) =>
      db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1),
    )

    if (rows.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(rows[0]?.settings || {})
  } catch (error) {
    console.error(
      'GET /api/modules/havoc-companions/settings error:',
      error instanceof Error ? error.message : error,
    )
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

    const existing = await withRLS((db) =>
      db
        .select({ id: moduleSettings.id, settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1),
    )

    if (existing.length > 0) {
      // Merge over the existing JSONB and re-validate the merged result so
      // any drift from older clients can never produce an invalid blob.
      const mergedRaw = {
        ...((existing[0].settings as Record<string, unknown> | null) ?? {}),
        ...validation.data,
      }
      const mergedParse = SettingsSchema.safeParse(mergedRaw)
      if (!mergedParse.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: mergedParse.error.issues },
          { status: 400 },
        )
      }
      await withRLS((db) =>
        db
          .update(moduleSettings)
          .set({
            settings: mergedParse.data,
            updatedAt: sql`timezone('utc'::text, now())`,
          })
          .where(eq(moduleSettings.id, existing[0].id)),
      )
    } else {
      await withRLS((db) =>
        db.insert(moduleSettings).values({
          userId: user.id,
          moduleId: MODULE_ID,
          settings: validation.data,
        }),
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(
      'PUT /api/modules/havoc-companions/settings error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}
