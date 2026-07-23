import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  createConversationSchema,
  chatListQuerySchema,
  ChatConversationListResponseSchema,
  ChatConversationSingleResponseSchema,
} from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { chatConversations } from '@/lib/db/schema'
import { count, desc, eq } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/chat/conversations',
  operationId: 'listChatConversations',
  summary: "List the user's chat conversations (most recently updated first)",
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { query: chatListQuerySchema },
  responses: {
    200: { description: 'List of conversations', content: { 'application/json': { schema: ChatConversationListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/chat/conversations',
  operationId: 'createChatConversation',
  summary: 'Create a new chat conversation',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: createConversationSchema } } } },
  responses: {
    201: { description: 'Created conversation', content: { 'application/json': { schema: ChatConversationSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const query = validateQueryParams(request.nextUrl.searchParams, chatListQuerySchema)
    if (!query.success) return query.response
    const { limit, offset } = query.data as { limit: number; offset: number }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const rows = await withRLS((db) =>
      db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.userId, user.id))
        .orderBy(desc(chatConversations.updatedAt))
        .limit(limit)
        .offset(offset)
    )
    const totalRows = await withRLS((db) =>
      db.select({ value: count() }).from(chatConversations).where(eq(chatConversations.userId, user.id))
    )

    return NextResponse.json({ conversations: toSnakeCase(rows), count: rows.length, total: totalRows[0].value })
  } catch (error) {
    console.error('GET /api/modules/chat/conversations error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, createConversationSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const rows = await withRLS((db) =>
      db
        .insert(chatConversations)
        .values({
          userId: user.id,
          title: validation.data.title?.trim() || 'New chat',
          provider: validation.data.provider,
          model: validation.data.model.trim(),
        })
        .returning()
    )

    return NextResponse.json({ conversation: toSnakeCase(rows[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/chat/conversations error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
