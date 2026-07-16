/**
 * Board of Advisors — conversation collection routes.
 * GET  /api/modules/board-of-advisors/conversations  → { conversations } (recent first)
 * POST /api/modules/board-of-advisors/conversations  → { conversation }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  createConversationSchema,
  boardListQuerySchema,
  ConversationListResponseSchema,
  ConversationSingleResponseSchema,
} from '@/modules/board-of-advisors/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { boardConversations } from '@/lib/db/schema'
import { count, desc, eq } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/board-of-advisors/conversations',
  operationId: 'listBoardConversations',
  summary: 'List board discussions, most recently active first',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { query: boardListQuerySchema },
  responses: {
    200: { description: 'Conversations ordered by updated_at', content: { 'application/json': { schema: ConversationListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/board-of-advisors/conversations',
  operationId: 'createBoardConversation',
  summary: 'Start a new board discussion',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: createConversationSchema } } } },
  responses: {
    201: { description: 'Created conversation', content: { 'application/json': { schema: ConversationSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const query = validateQueryParams(request.nextUrl.searchParams, boardListQuerySchema)
    if (!query.success) return query.response
    const { limit, offset } = query.data as { limit: number; offset: number }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const conversations = await withRLS((db) =>
      db
        .select()
        .from(boardConversations)
        .where(eq(boardConversations.userId, user.id))
        .orderBy(desc(boardConversations.updatedAt))
        .limit(limit)
        .offset(offset)
    )
    const totalRows = await withRLS((db) =>
      db.select({ value: count() }).from(boardConversations).where(eq(boardConversations.userId, user.id))
    )

    return NextResponse.json({
      conversations: toSnakeCase(conversations),
      count: conversations.length,
      total: totalRows[0].value,
    })
  } catch (error) {
    console.error('GET /api/modules/board-of-advisors/conversations error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, createConversationSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const created = await withRLS((db) =>
      db
        .insert(boardConversations)
        .values({
          userId: user.id,
          ...(validation.data.title ? { title: validation.data.title } : {}),
        })
        .returning()
    )

    return NextResponse.json({ conversation: toSnakeCase(created[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/board-of-advisors/conversations error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
