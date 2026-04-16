/**
 * Bible Study - Conversations API
 *
 * GET  /api/modules/bible-study/conversations  — list all conversations (newest first)
 * POST /api/modules/bible-study/conversations  — create a new conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { bibleStudyConversations } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

const CreateConversationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer').optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const conversations = await withRLS((db) =>
      db.select().from(bibleStudyConversations)
        .where(eq(bibleStudyConversations.userId, user.id))
        .orderBy(desc(bibleStudyConversations.updatedAt))
        .limit(100)
    )

    return NextResponse.json({ conversations: toSnakeCase(conversations) })
  } catch (error) {
    console.error('GET /api/modules/bible-study/conversations error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreateConversationSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const data = await withRLS((db) =>
      db.insert(bibleStudyConversations).values({
        userId: user.id,
        title: validation.data.title || 'New Conversation',
      }).returning()
    )

    return NextResponse.json({ conversation: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/bible-study/conversations error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
