/**
 * Dashboard Module - Settings API Routes
 *
 * Endpoints:
 * - GET /api/modules/dashboard/settings  - Get user's dashboard settings
 * - PUT /api/modules/dashboard/settings  - Update user's settings (partial)
 *
 * The PUT does a single atomic upsert that merges the new keys into the
 * existing JSONB rather than overwriting it, so future settings slices can
 * each save independently without clobbering each other.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  DashboardSettingsSchema as SettingsSchema,
  DashboardSettingsSavedSchema,
} from '@/modules/dashboard/lib/validation'
import { registry } from '@/lib/openapi/registry'
import {
  DEFAULT_SECURITY,
  ErrorResponseSchema,
  InternalServerErrorResponse,
} from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/dashboard/settings',
  operationId: 'getDashboardSettings',
  summary: "Fetch the user's dashboard settings (or empty object)",
  tags: ['dashboard'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: 'Settings object (all fields optional)',
      content: { 'application/json': { schema: SettingsSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/dashboard/settings',
  operationId: 'updateDashboardSettings',
  summary: 'JSONB-merge update of dashboard settings',
  tags: ['dashboard'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: SettingsSchema } } } },
  responses: {
    200: {
      description: 'Settings saved',
      content: { 'application/json': { schema: DashboardSettingsSavedSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const data = await withRLS((db) =>
      db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, 'dashboard')))
        .limit(1),
    )

    // Strip system-managed bookkeeping keys (e.g. __schema_installed_hash) so
    // they never reach config UIs. Settings panels merge whatever GET returns
    // into form state and PUT it back through a `.strict()` schema, which
    // would reject these `__`-prefixed keys. They stay in the DB regardless —
    // the PUT does a JSONB merge that preserves keys not present in the patch.
    const raw = (data[0]?.settings ?? {}) as Record<string, unknown>
    const settings = Object.fromEntries(
      Object.entries(raw).filter(([key]) => !key.startsWith('__')),
    )

    return NextResponse.json(settings)
  } catch (error) {
    console.error(
      'GET /api/modules/dashboard/settings error:',
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

    // Atomic upsert + JSONB merge: `existing || EXCLUDED` keeps any prior keys
    // not present in the new payload. Relies on the unique constraint on
    // (user_id, module_id) in core-schema.ts.
    const patch = JSON.stringify(validation.data)
    await withRLS((db) =>
      db
        .insert(moduleSettings)
        .values({
          userId: user.id,
          moduleId: 'dashboard',
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
    console.error(
      'PUT /api/modules/dashboard/settings error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}
