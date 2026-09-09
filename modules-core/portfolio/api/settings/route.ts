/**
 * Portfolio Module - Settings API
 *
 * Endpoints:
 * - GET /api/modules/portfolio/settings - Get user's portfolio settings
 * - PUT /api/modules/portfolio/settings - Update user's portfolio settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import {
  PortfolioSettingsSchema as SettingsSchema,
  PortfolioSettingsSaveResponseSchema,
} from '../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import {
  DEFAULT_SECURITY,
  ErrorResponseSchema,
  InternalServerErrorResponse,
} from '@/lib/openapi/common'

const MODULE_ID = 'portfolio'

registry.registerPath({
  method: 'get',
  path: '/api/modules/portfolio/settings',
  operationId: 'getPortfolioSettings',
  summary: "Fetch the user's Portfolio module settings (or empty object)",
  tags: ['portfolio'],
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
  path: '/api/modules/portfolio/settings',
  operationId: 'updatePortfolioSettings',
  summary: 'JSON-merge update of Portfolio module settings',
  tags: ['portfolio'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: SettingsSchema } } } },
  responses: {
    200: {
      description: 'Settings saved',
      content: { 'application/json': { schema: PortfolioSettingsSaveResponseSchema } },
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

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const data = await withRLS((db) =>
      db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
        .limit(1),
    )

    return NextResponse.json(data[0]?.settings || {})
  } catch (error) {
    console.error(
      'GET /api/modules/portfolio/settings error:',
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

    // Single atomic upsert with an in-database JSONB merge: no 23505 race on
    // concurrent first-time saves, and concurrent merges can't drop fields.
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
            settings: sql`COALESCE(${moduleSettings.settings}, '{}'::jsonb) || excluded.settings`,
            updatedAt: sql`timezone('utc'::text, now())`,
          },
        }),
    )

    return NextResponse.json({ success: true, message: 'Settings saved' })
  } catch (error) {
    console.error(
      'PUT /api/modules/portfolio/settings error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}
