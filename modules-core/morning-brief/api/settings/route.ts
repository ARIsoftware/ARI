/**
 * Morning Brief Module - Settings API
 *
 * GET  /api/modules/morning-brief/settings  - Fetch the user's settings (or {})
 * PUT  /api/modules/morning-brief/settings  - JSONB-merge update of settings
 *
 * Settings live in module_settings.settings (JSONB), one row per (user_id,
 * module_id). The only persisted field is `selectedAiProvider`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { MorningBriefSettingsSchema, SettingsSavedSchema } from '@/modules/morning-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

const MODULE_ID = 'morning-brief'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/settings',
  operationId: 'getMorningBriefSettings',
  summary: "Fetch the user's Morning Brief settings (or empty object)",
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings object', content: { 'application/json': { schema: MorningBriefSettingsSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/morning-brief/settings',
  operationId: 'updateMorningBriefSettings',
  summary: 'JSONB-merge update of Morning Brief settings',
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: MorningBriefSettingsSchema } } } },
  responses: {
    200: { description: 'Settings saved', content: { 'application/json': { schema: SettingsSavedSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Explicit user_id filter is mandatory: the default Postgres role has
    // BYPASSRLS, so RLS alone won't scope this read (see docs/SECURITY.md).
    const rows = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
        .limit(1)
    )

    // Strip system-managed bookkeeping keys (e.g. __schema_installed_hash) so a
    // .strict() PUT round-trip from the settings panel never rejects them.
    const raw = (rows[0]?.settings ?? {}) as Record<string, unknown>
    const settings = Object.fromEntries(
      Object.entries(raw).filter(([key]) => !key.startsWith('__'))
    )

    return NextResponse.json(settings)
  } catch (error) {
    console.error('GET /api/modules/morning-brief/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, MorningBriefSettingsSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const patch = JSON.stringify(validation.data)
    await withRLS((db) =>
      db.insert(moduleSettings)
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
    console.error('PUT /api/modules/morning-brief/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
