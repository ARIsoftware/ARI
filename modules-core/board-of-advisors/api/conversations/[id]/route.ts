/**
 * Board of Advisors — single conversation routes.
 * GET    /api/modules/board-of-advisors/conversations/{id}  → { conversation, messages }
 * PATCH  /api/modules/board-of-advisors/conversations/{id}  → { conversation } (rename)
 * DELETE /api/modules/board-of-advisors/conversations/{id}  → { success } (messages cascade)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validatePathParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  renameConversationSchema,
  conversationIdParamSchema,
  ConversationDetailResponseSchema,
  ConversationSingleResponseSchema,
  DeleteResponseSchema,
} from '@/modules/board-of-advisors/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { boardConversations, boardMessages } from '@/lib/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

/** Newest messages returned per conversation load — keeps the payload and the
 *  thread render bounded for very long discussions. */
const MESSAGES_MAX_ROWS = 500

registry.registerPath({
  method: 'get',
  path: '/api/modules/board-of-advisors/conversations/{id}',
  operationId: 'getBoardConversation',
  summary: 'Fetch a board discussion with its full message history',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { params: conversationIdParamSchema },
  responses: {
    200: { description: 'Conversation and messages (oldest first)', content: { 'application/json': { schema: ConversationDetailResponseSchema } } },
    400: { description: 'Invalid conversation id', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/modules/board-of-advisors/conversations/{id}',
  operationId: 'renameBoardConversation',
  summary: 'Rename a board discussion',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { params: conversationIdParamSchema, body: { content: { 'application/json': { schema: renameConversationSchema } } } },
  responses: {
    200: { description: 'Renamed conversation', content: { 'application/json': { schema: ConversationSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/board-of-advisors/conversations/{id}',
  operationId: 'deleteBoardConversation',
  summary: 'Delete a board discussion and all of its messages',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { params: conversationIdParamSchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: DeleteResponseSchema } } },
    400: { description: 'Invalid conversation id', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = validatePathParams(await context.params, conversationIdParamSchema)
    if (!params.success) return params.response
    const { id } = params.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const convo = await withRLS((db) =>
      db
        .select()
        .from(boardConversations)
        .where(and(eq(boardConversations.id, id), eq(boardConversations.userId, user.id)))
        .limit(1)
    )
    if (convo.length === 0) {
      return createErrorResponse('Conversation not found', 404)
    }

    // Newest rows first, capped, then restored to chronological order — the
    // same bounding technique the roundtable route uses for its transcript.
    const messagesDesc = await withRLS((db) =>
      db
        .select()
        .from(boardMessages)
        .where(and(eq(boardMessages.conversationId, id), eq(boardMessages.userId, user.id)))
        .orderBy(desc(boardMessages.createdAt), desc(boardMessages.id))
        .limit(MESSAGES_MAX_ROWS)
    )

    return NextResponse.json({
      conversation: toSnakeCase(convo[0]),
      messages: toSnakeCase(messagesDesc.reverse()),
    })
  } catch (error) {
    console.error('GET /api/modules/board-of-advisors/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = validatePathParams(await context.params, conversationIdParamSchema)
    if (!params.success) return params.response
    const { id } = params.data

    const validation = await validateRequestBody(request, renameConversationSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const updated = await withRLS((db) =>
      db
        .update(boardConversations)
        .set({ title: validation.data.title, updatedAt: sql`now()` })
        .where(and(eq(boardConversations.id, id), eq(boardConversations.userId, user.id)))
        .returning()
    )

    if (updated.length === 0) {
      return createErrorResponse('Conversation not found', 404)
    }

    return NextResponse.json({ conversation: toSnakeCase(updated[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/board-of-advisors/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = validatePathParams(await context.params, conversationIdParamSchema)
    if (!params.success) return params.response
    const { id } = params.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const deleted = await withRLS((db) =>
      db
        .delete(boardConversations)
        .where(and(eq(boardConversations.id, id), eq(boardConversations.userId, user.id)))
        .returning({ id: boardConversations.id })
    )

    if (deleted.length === 0) {
      return createErrorResponse('Conversation not found', 404)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/board-of-advisors/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
