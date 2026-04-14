/**
 * Bible Study - Conversation Messages API
 *
 * POST /api/modules/bible-study/conversations/[id]/messages
 *   — send a message, get AI reply, persist both, return both
 *   — auto-generates a conversation title after the first exchange
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { bibleStudyConversations, bibleStudyMessages, moduleSettings } from '@/lib/db/schema'
import { and, eq, asc, count } from 'drizzle-orm'
import {
  resolveOpenRouterConfig,
  callOpenRouter,
  BIBLE_SYSTEM_PROMPT,
  generateConversationTitle,
} from '@/modules/bible-study/lib/openrouter'

const SendMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message must be 10000 characters or fewer'),
})

function extractConversationId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/')
  // path: .../conversations/[id]/messages
  const messagesIdx = segments.lastIndexOf('messages')
  return segments[messagesIdx - 1]
}

export async function POST(request: NextRequest) {
  try {
    const conversationId = extractConversationId(request)
    const validation = await validateRequestBody(request, SendMessageSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    // Verify conversation belongs to user
    const [conversation] = await withRLS((db) =>
      db.select().from(bibleStudyConversations)
        .where(and(
          eq(bibleStudyConversations.id, conversationId),
          eq(bibleStudyConversations.userId, user.id)
        ))
        .limit(1)
    )

    if (!conversation) return createErrorResponse('Conversation not found', 404)

    // Resolve OpenRouter config (env var takes priority over module settings)
    const settingsData = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'bible-study'))
        .limit(1)
    )

    const settings = (settingsData[0]?.settings || {}) as Record<string, unknown>
    const config = resolveOpenRouterConfig(settings)

    if (!config) {
      return createErrorResponse(
        'OpenRouter API key not configured. Add OPENROUTER_API_KEY to your environment or set it in Bible Study settings.',
        400
      )
    }

    // Check how many messages exist (for auto-title generation after first exchange)
    const [{ value: existingCount }] = await withRLS((db) =>
      db.select({ value: count() }).from(bibleStudyMessages)
        .where(eq(bibleStudyMessages.conversationId, conversationId))
    )

    const isFirstMessage = Number(existingCount) === 0

    // Load full conversation history for context
    const priorMessages = await withRLS((db) =>
      db.select().from(bibleStudyMessages)
        .where(and(
          eq(bibleStudyMessages.conversationId, conversationId),
          eq(bibleStudyMessages.userId, user.id)
        ))
        .orderBy(asc(bibleStudyMessages.createdAt))
    )

    // Save user message
    const [userMsg] = await withRLS((db) =>
      db.insert(bibleStudyMessages).values({
        userId: user.id,
        conversationId,
        role: 'user',
        content: validation.data.message,
      }).returning()
    )

    // Build messages for OpenRouter
    const chatHistory = [
      { role: 'system' as const, content: BIBLE_SYSTEM_PROMPT },
      ...priorMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: validation.data.message },
    ]

    // Call OpenRouter
    let assistantContent: string
    try {
      assistantContent = await callOpenRouter(config, chatHistory)
    } catch (err) {
      // Remove the user message we just inserted since we can't complete the exchange
      await withRLS((db) =>
        db.delete(bibleStudyMessages).where(eq(bibleStudyMessages.id, userMsg.id))
      )
      console.error('OpenRouter error:', err instanceof Error ? err.message : err)
      return createErrorResponse(err instanceof Error ? err.message : 'AI request failed', 502)
    }

    // Save assistant message
    const [assistantMsg] = await withRLS((db) =>
      db.insert(bibleStudyMessages).values({
        userId: user.id,
        conversationId,
        role: 'assistant',
        content: assistantContent,
      }).returning()
    )

    // Update conversation's updated_at
    await withRLS((db) =>
      db.update(bibleStudyConversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(bibleStudyConversations.id, conversationId))
    )

    // Auto-generate title from first message (fire-and-forget, don't block response)
    let updatedTitle: string | undefined
    if (isFirstMessage && conversation.title === 'New Conversation') {
      try {
        const title = await generateConversationTitle(config, validation.data.message)
        await withRLS((db) =>
          db.update(bibleStudyConversations)
            .set({ title, updatedAt: new Date().toISOString() })
            .where(eq(bibleStudyConversations.id, conversationId))
        )
        updatedTitle = title
      } catch {
        // Title generation is best-effort; don't fail the request
      }
    }

    return NextResponse.json({
      user_message: toSnakeCase(userMsg),
      assistant_message: toSnakeCase(assistantMsg),
      updated_title: updatedTitle ?? null,
    }, { status: 201 })
  } catch (error) {
    console.error('POST .../conversations/[id]/messages error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
