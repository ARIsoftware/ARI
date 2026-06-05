/**
 * Motivation — settings endpoint.
 *   GET /api/modules/motivation/settings  → fetch settings (empty {} if none)
 *   PUT /api/modules/motivation/settings  → JSONB-merge update
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  MotivationSettingsSchema as SettingsSchema,
  SettingsSavedSchema,
} from '@/modules/motivation/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/motivation/settings',
  operationId: 'getMotivationSettings',
  summary: "Fetch the user's motivation settings (or empty object)",
  tags: ['motivation'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings object', content: { 'application/json': { schema: SettingsSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/motivation/settings',
  operationId: 'updateMotivationSettings',
  summary: 'JSONB-merge update of motivation settings',
  tags: ['motivation'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: SettingsSchema } } } },
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

    // Explicit user_id filter is mandatory — the default Postgres role
    // bypasses RLS (see docs/SECURITY.md), so the moduleId-only filter
    // would otherwise return another user's settings row.
    const data = await withRLS((db) =>
      db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, 'motivation'))),
    )

    return NextResponse.json(data[0]?.settings ?? {})
  } catch (error) {
    console.error('GET /api/modules/motivation/settings error:', error instanceof Error ? error.message : error)
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

    // `patch` is bound as a parameter by Drizzle's sql`` template (the ${}
    // interpolation becomes a parameterized value, NOT raw concatenation),
    // so the JSONB merge is safe from injection. If you ever switch to
    // sql.raw() this guarantee is lost — revisit then.
    const patch = JSON.stringify(validation.data)
    await withRLS((db) =>
      db
        .insert(moduleSettings)
        .values({
          userId: user.id,
          moduleId: 'motivation',
          settings: validation.data,
        })
        .onConflictDoUpdate({
          target: [moduleSettings.userId, moduleSettings.moduleId],
          set: {
            settings: sql`COALESCE(${moduleSettings.settings}, '{}'::jsonb) || ${patch}::jsonb`,
            updatedAt: sql`timezone('utc'::text, now())`,
          },
        }),
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/modules/motivation/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
