/**
 * Bible Study - Single Conversation API
 *
 * GET    /api/modules/bible-study/conversations/[id]  — get conversation + its messages
 * PATCH  /api/modules/bible-study/conversations/[id]  — rename conversation
 * DELETE /api/modules/bible-study/conversations/[id]  — delete conversation (cascades messages)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { bibleStudyConversations, bibleStudyMessages } from '@/lib/db/schema'
import { and, eq, asc } from 'drizzle-orm'

const RenameSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
})

function extractId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/')
  return segments[segments.length - 1]
}

export async function GET(request: NextRequest) {
  try {
    const id = extractId(request)
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const [conversation] = await withRLS((db) =>
      db.select().from(bibleStudyConversations)
        .where(and(eq(bibleStudyConversations.id, id), eq(bibleStudyConversations.userId, user.id)))
        .limit(1)
    )

    if (!conversation) return createErrorResponse('Conversation not found', 404)

    const messages = await withRLS((db) =>
      db.select().from(bibleStudyMessages)
        .where(and(eq(bibleStudyMessages.conversationId, id), eq(bibleStudyMessages.userId, user.id)))
        .orderBy(asc(bibleStudyMessages.createdAt))
    )

    return NextResponse.json({
      conversation: toSnakeCase(conversation),
      messages: toSnakeCase(messages),
    })
  } catch (error) {
    console.error('GET /api/modules/bible-study/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = extractId(request)
    const validation = await validateRequestBody(request, RenameSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const data = await withRLS((db) =>
      db.update(bibleStudyConversations)
        .set({ title: validation.data.title, updatedAt: new Date().toISOString() })
        .where(and(eq(bibleStudyConversations.id, id), eq(bibleStudyConversations.userId, user.id)))
        .returning()
    )

    if (data.length === 0) return createErrorResponse('Conversation not found', 404)
    return NextResponse.json({ conversation: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/bible-study/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = extractId(request)
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    await withRLS((db) =>
      db.delete(bibleStudyConversations)
        .where(and(eq(bibleStudyConversations.id, id), eq(bibleStudyConversations.userId, user.id)))
    )

    return NextResponse.json({ success: true, message: 'Conversation deleted' })
  } catch (error) {
    console.error('DELETE /api/modules/bible-study/conversations/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
