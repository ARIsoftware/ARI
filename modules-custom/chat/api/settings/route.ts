import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { ChatSettingsSchema, SettingsSavedSchema } from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/chat/settings',
  operationId: 'getChatSettings',
  summary: "Fetch the user's chat module settings",
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings object (all fields optional)', content: { 'application/json': { schema: ChatSettingsSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/chat/settings',
  operationId: 'updateChatSettings',
  summary: 'JSONB-merge update of chat module settings',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: ChatSettingsSchema } } } },
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
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const rows = await withRLS((db) =>
      db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, 'chat')))
        .limit(1)
    )

    return NextResponse.json(rows[0]?.settings ?? {})
  } catch (error) {
    console.error('GET /api/modules/chat/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, ChatSettingsSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const patch = JSON.stringify(validation.data)
    await withRLS((db) =>
      db
        .insert(moduleSettings)
        .values({
          userId: user.id,
          moduleId: 'chat',
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
    console.error('PUT /api/modules/chat/settings error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
