import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  MusicPlayerSettingsSchema as SettingsSchema,
  SuccessResponseSchema,
} from '@/modules/music-player/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/music-player/settings',
  operationId: 'getMusicPlayerSettings',
  summary: "Fetch the user's Music Player module settings (or empty object)",
  tags: ['music-player'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings object (all fields optional)', content: { 'application/json': { schema: SettingsSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/music-player/settings',
  operationId: 'updateMusicPlayerSettings',
  summary: 'Partial-merge update of Music Player module settings',
  tags: ['music-player'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: SettingsSchema } } } },
  responses: {
    200: { description: 'Settings saved', content: { 'application/json': { schema: SuccessResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
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
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'music-player'))
        .limit(1)
    )

    if (data.length === 0) {
      return NextResponse.json({})
    }

    return NextResponse.json(data[0]?.settings || {})
  } catch (error) {
    console.error('GET /api/modules/music-player/settings error:', error instanceof Error ? error.message : error)
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
      db.select({ id: moduleSettings.id, settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'music-player'))
        .limit(1)
    )

    if (existing.length > 0) {
      // Preserve unknown keys from older versions so we don't 500 on legacy data.
      // The incoming payload was already strict-validated by validateRequestBody.
      const merged = {
        ...(existing[0].settings as Record<string, unknown> || {}),
        ...validation.data,
      }
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: merged,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(moduleSettings.id, existing[0].id))
      )
    } else {
      await withRLS((db) =>
        db.insert(moduleSettings)
          .values({
            userId: user.id,
            moduleId: 'music-player',
            settings: validation.data
          })
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/modules/music-player/settings error:', error instanceof Error ? error.message : error)
    const isDev = process.env.NODE_ENV !== 'production'
    return createErrorResponse(
      'Internal server error',
      500,
      isDev && error instanceof Error ? { message: error.message } : undefined,
    )
  }
}
