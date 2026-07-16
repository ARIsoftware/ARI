/**
 * Board of Advisors — settings routes.
 * GET /api/modules/board-of-advisors/settings  - Get user's settings
 * PUT /api/modules/board-of-advisors/settings  - Update user's settings (partial)
 *
 * The PUT does a single atomic upsert that merges the new keys into the
 * existing JSONB rather than overwriting it — so the settings page and the
 * onboarding flow can each save their own slice without clobbering the other.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  BoardSettingsSchema,
  SettingsSavedSchema,
} from '@/modules/board-of-advisors/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/board-of-advisors/settings',
  operationId: 'getBoardSettings',
  summary: "Fetch the user's Board of Advisors settings (or empty object)",
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings object (all fields optional)', content: { 'application/json': { schema: BoardSettingsSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/board-of-advisors/settings',
  operationId: 'updateBoardSettings',
  summary: 'JSONB-merge update of Board of Advisors settings',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: BoardSettingsSchema } } } },
  responses: {
    200: { description: 'Settings saved', content: { 'application/json': { schema: SettingsSavedSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, 'board-of-advisors')))
        .limit(1)
    )

    // Strip system-managed bookkeeping keys (e.g. __schema_installed_hash) so
    // they never reach config UIs — the PUT schema is `.strict()` and would
    // reject them coming back. The JSONB merge preserves them in the DB.
    const raw = (data[0]?.settings ?? {}) as Record<string, unknown>
    const settings = Object.fromEntries(
      Object.entries(raw).filter(([key]) => !key.startsWith('__'))
    )

    return NextResponse.json(settings)
  } catch (error) {
    console.error('GET /api/modules/board-of-advisors/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, BoardSettingsSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Atomic upsert + JSONB merge: `existing || EXCLUDED` keeps any prior keys
    // not present in the new payload.
    const patch = JSON.stringify(validation.data)
    await withRLS((db) =>
      db.insert(moduleSettings)
        .values({
          userId: user.id,
          moduleId: 'board-of-advisors',
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
    console.error('PUT /api/modules/board-of-advisors/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
