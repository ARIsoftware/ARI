import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validatePathParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  updateConversationSchema,
  chatIdParamSchema,
  ChatConversationDetailResponseSchema,
  ChatConversationSingleResponseSchema,
  ChatDeleteResponseSchema,
} from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { chatConversations, chatMessages } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'

// Cap the detail payload — very long chats return only the most recent turns.
const MESSAGES_CAP = 500

registry.registerPath({
  method: 'get',
  path: '/api/modules/chat/conversations/{id}',
  operationId: 'getChatConversation',
  summary: 'Fetch a conversation with its messages',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { params: chatIdParamSchema },
  responses: {
    200: { description: 'Conversation + messages', content: { 'application/json': { schema: ChatConversationDetailResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/modules/chat/conversations/{id}',
  operationId: 'renameChatConversation',
  summary: 'Rename a conversation',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { params: chatIdParamSchema, body: { content: { 'application/json': { schema: updateConversationSchema } } } },
  responses: {
    200: { description: 'Updated conversation', content: { 'application/json': { schema: ChatConversationSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/chat/conversations/{id}',
  operationId: 'deleteChatConversation',
  summary: 'Delete a conversation (cascades to messages; uploads keep references but conversation_id becomes null)',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { params: chatIdParamSchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: ChatDeleteResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

type RouteContext = { params: Promise<{ id: string }> }

async function resolveId(context: RouteContext) {
  return validatePathParams(await context.params, chatIdParamSchema)
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await resolveId(context)
    if (!parsed.success) return parsed.response
    const { id } = parsed.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const convo = await withRLS((db) =>
      db
        .select()
        .from(chatConversations)
        .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, user.id)))
        .limit(1)
    )
    if (convo.length === 0) return createErrorResponse('Conversation not found', 404)

    const messages = await withRLS((db) =>
      db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, id), eq(chatMessages.userId, user.id)))
        .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
        .limit(MESSAGES_CAP)
    )
    messages.reverse()

    return NextResponse.json({
      conversation: toSnakeCase(convo[0]),
      messages: toSnakeCase(messages),
    })
  } catch (error) {
    console.error('GET /api/modules/chat/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await resolveId(context)
    if (!parsed.success) return parsed.response
    const { id } = parsed.data

    const validation = await validateRequestBody(request, updateConversationSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const rows = await withRLS((db) =>
      db
        .update(chatConversations)
        .set({ title: validation.data.title.trim(), updatedAt: new Date().toISOString() })
        .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, user.id)))
        .returning()
    )

    if (rows.length === 0) return createErrorResponse('Conversation not found', 404)
    return NextResponse.json({ conversation: toSnakeCase(rows[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/chat/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const parsed = await resolveId(context)
    if (!parsed.success) return parsed.response
    const { id } = parsed.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const rows = await withRLS((db) =>
      db
        .delete(chatConversations)
        .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, user.id)))
        .returning({ id: chatConversations.id })
    )

    if (rows.length === 0) return createErrorResponse('Conversation not found', 404)
    return NextResponse.json({ success: true, message: 'Conversation deleted' })
  } catch (error) {
    console.error('DELETE /api/modules/chat/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
