/**
 * Timezones Module - Settings API Routes
 *
 * Stores the caller's own ("MY TIME ZONE") home zone in module_settings, which
 * is a per-user table — the row is keyed by (user_id, module_id).
 *
 * Endpoints:
 * - GET /api/modules/timezones/settings  - Get the caller's settings
 * - PUT /api/modules/timezones/settings  - JSONB-merge update
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  TimezonesSettingsSchema as SettingsSchema,
  SettingsSavedSchema,
} from '@/modules/timezones/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

const MODULE_ID = 'timezones'

registry.registerPath({
  method: 'get',
  path: '/api/modules/timezones/settings',
  operationId: 'getTimezonesSettings',
  summary: "Fetch the caller's timezones settings (or empty object)",
  tags: ['timezones'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings object (all fields optional)', content: { 'application/json': { schema: SettingsSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/timezones/settings',
  operationId: 'updateTimezonesSettings',
  summary: 'JSONB-merge update of timezones settings',
  tags: ['timezones'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: SettingsSchema } } } },
  responses: {
    200: { description: 'Settings saved', content: { 'application/json': { schema: SettingsSavedSchema } } },
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
        // module_settings is per-user: without the user_id filter this LIMIT 1
        // can return another user's row, since the DB role bypasses RLS.
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
        .limit(1)
    )

    // Strip system-managed bookkeeping keys (e.g. __schema_installed_hash) —
    // the client round-trips whatever GET returns back through a .strict()
    // schema, which would reject them.
    const raw = (rows[0]?.settings ?? {}) as Record<string, unknown>
    const settings = Object.fromEntries(
      Object.entries(raw).filter(([key]) => !key.startsWith('__'))
    )

    return NextResponse.json(settings)
  } catch (error) {
    console.error('GET /api/modules/timezones/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Authenticate before parsing the body, so an unauthenticated caller gets a
    // 401 rather than a 400 that discloses the schema.
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const validation = await validateRequestBody(request, SettingsSchema)
    if (!validation.success) {
      return validation.response
    }

    // Atomic upsert + JSONB merge, so a partial save never drops other keys.
    const patch = JSON.stringify(validation.data)
    await withRLS((db) =>
      db
        .insert(moduleSettings)
        .values({
          userId: user.id,
          moduleId: MODULE_ID,
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
    console.error('PUT /api/modules/timezones/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
