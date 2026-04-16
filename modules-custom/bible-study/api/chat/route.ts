/**
 * Bible Study - Legacy flat chat route
 *
 * Used by the floating BibleChat bubble when viewing a specific study.
 * Stores messages in the flat bible_study_chat_messages table (no conversation threading).
 *
 * For the full conversational chat experience see:
 *   /api/modules/bible-study/conversations
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { bibleStudyChatMessages, moduleSettings } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import {
  resolveOpenRouterConfig,
  callOpenRouter,
  BIBLE_SYSTEM_PROMPT,
  buildContextualPrompt,
} from '@/modules/bible-study/lib/openrouter'

const SendMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(5000, 'Message must be 5000 characters or fewer'),
  study_context: z.object({
    type: z.enum(['kids', 'personal']),
    studyId: z.string(),
    title: z.string(),
    book: z.string(),
    chapter: z.number(),
  }).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const messages = await withRLS((db) =>
      db.select().from(bibleStudyChatMessages)
        .where(eq(bibleStudyChatMessages.userId, user.id))
        .orderBy(desc(bibleStudyChatMessages.createdAt))
        .limit(50)
    )

    return NextResponse.json({ messages: toSnakeCase(messages.reverse()) })
  } catch (error) {
    console.error('GET /api/modules/bible-study/chat error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, SendMessageSchema)
    if (!validation.success) return validation.response

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

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

    const userMsg = await withRLS((db) =>
      db.insert(bibleStudyChatMessages).values({
        userId: user.id,
        role: 'user',
        content: validation.data.message,
        studyContext: validation.data.study_context ?? null,
      }).returning()
    )

    const systemPrompt = buildContextualPrompt(BIBLE_SYSTEM_PROMPT, validation.data.study_context)

    const recentMessages = await withRLS((db) =>
      db.select().from(bibleStudyChatMessages)
        .where(eq(bibleStudyChatMessages.userId, user.id))
        .orderBy(desc(bibleStudyChatMessages.createdAt))
        .limit(10)
    )

    const chatHistory = recentMessages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    let assistantContent: string
    try {
      assistantContent = await callOpenRouter(config, [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
      ])
    } catch (err) {
      console.error('OpenRouter error:', err instanceof Error ? err.message : err)
      return createErrorResponse(err instanceof Error ? err.message : 'AI request failed', 502)
    }

    const assistantMsg = await withRLS((db) =>
      db.insert(bibleStudyChatMessages).values({
        userId: user.id,
        role: 'assistant',
        content: assistantContent,
        studyContext: validation.data.study_context ?? null,
      }).returning()
    )

    return NextResponse.json({
      user_message: toSnakeCase(userMsg[0]),
      assistant_message: toSnakeCase(assistantMsg[0]),
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/bible-study/chat error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    await withRLS((db) =>
      db.delete(bibleStudyChatMessages)
        .where(eq(bibleStudyChatMessages.userId, user.id))
    )

    return NextResponse.json({ success: true, message: 'Chat history cleared' })
  } catch (error) {
    console.error('DELETE /api/modules/bible-study/chat error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
