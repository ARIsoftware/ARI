import { NextRequest } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validatePathParams, createErrorResponse } from '@/lib/api-helpers'
import { chatMessageParamSchema, editMessageSchema } from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { chatConversations, chatMessages } from '@/lib/db/schema'
import { and, desc, eq, gt, lt, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/modules/public-route-security'
import { getProviderApiKey, resolveImageConfig } from '@/modules/chat/lib/providers'
import { generateReply } from '@/modules/chat/lib/reply'
import { saveGeneratedImage } from '@/modules/chat/lib/image-store'
import { createReplyStream, sseResponse } from '@/modules/chat/lib/reply-stream'
import {
  HISTORY_WINDOW,
  REPLY_RATE_LIMIT_KEY,
  REPLY_RATE_LIMIT_PER_MIN,
  deriveTitle,
  isFirstExchange,
  shouldAutoTitle,
  toChatMessage,
} from '@/modules/chat/lib/turns'
import type { ChatProvider } from '@/modules/chat/types'

registry.registerPath({
  method: 'patch',
  path: '/api/modules/chat/conversations/{id}/messages/{messageId}',
  operationId: 'editChatMessage',
  summary: 'Edit a user message and stream a new reply via Server-Sent Events',
  description: 'Replaces the message text (attachments are kept) and answers it again. Every later message in the conversation is replaced by the new reply — applied only when that reply is saved, so a failed edit changes nothing. Same event stream as sendChatMessage.',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: {
    params: chatMessageParamSchema,
    body: { content: { 'application/json': { schema: editMessageSchema } } },
  },
  responses: {
    200: { description: 'SSE stream of assistant reply', content: { 'text/event-stream': { schema: z.string() } } },
    400: { description: 'Validation error / not a user message', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation or message not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    412: { description: 'Provider not configured', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const parsed = validatePathParams(await context.params, chatMessageParamSchema)
    if (!parsed.success) return parsed.response
    const { id: conversationId, messageId } = parsed.data

    // Authenticate before parsing the (up to 50KB) body.
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    if (!checkRateLimit(REPLY_RATE_LIMIT_KEY(user.id), REPLY_RATE_LIMIT_PER_MIN)) {
      return createErrorResponse('Too many messages. Please wait a moment and try again.', 429)
    }

    const validation = await validateRequestBody(request, editMessageSchema)
    if (!validation.success) return validation.response
    const content = validation.data.content

    const convo = await withRLS((db) =>
      db
        .select({ provider: chatConversations.provider, model: chatConversations.model, title: chatConversations.title })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, user.id)))
        .limit(1)
    )
    if (convo.length === 0) return createErrorResponse('Conversation not found', 404)
    const conversation = convo[0]

    const provider = conversation.provider as ChatProvider
    const apiKey = await getProviderApiKey(user.id, provider)
    if (!apiKey) {
      return createErrorResponse(
        `No API key configured for ${provider}. Add one in Settings → Integrations.`,
        412
      )
    }
    const image = await resolveImageConfig(user.id, provider)

    const targetRows = await withRLS((db) =>
      db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, messageId),
            eq(chatMessages.conversationId, conversationId),
            eq(chatMessages.userId, user.id)
          )
        )
        .limit(1)
    )
    if (targetRows.length === 0) return createErrorResponse('Message not found', 404)
    const target = targetRows[0]
    if (target.role !== 'user') return createErrorResponse('Only your own messages can be edited', 400)

    // Chronological order is (created_at, id) — the same tie-breaker every
    // chat read uses — so "up to" and "after" the target partition cleanly.
    const upToTarget = or(
      lt(chatMessages.createdAt, target.createdAt),
      and(eq(chatMessages.createdAt, target.createdAt), lte(chatMessages.id, target.id))
    )
    const afterTarget = or(
      gt(chatMessages.createdAt, target.createdAt),
      and(eq(chatMessages.createdAt, target.createdAt), gt(chatMessages.id, target.id))
    )

    const windowDesc = await withRLS((db) =>
      db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.userId, user.id), upToTarget))
        .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
        .limit(HISTORY_WINDOW)
    )
    const history = windowDesc
      .reverse()
      .map((m) => toChatMessage(m.id === target.id ? { ...m, content } : m))
    const autoTitle = isFirstExchange(history) && shouldAutoTitle(conversation.title, target.content)

    return sseResponse(
      createReplyStream({
        userTurnId: target.id,
        generate: (signal) =>
          generateReply({
            userId: user.id,
            provider,
            model: conversation.model,
            history,
            apiKey,
            signal,
            image,
            saveImage: (generated, prompt) =>
              saveGeneratedImage({ userId: user.id, conversationId, withRLS, image: generated, prompt }),
          }),
        persist: async (text, _partial, attachments) => {
          const row = await withRLS(async (db) => {
            await db
              .update(chatMessages)
              .set({ content })
              .where(and(eq(chatMessages.id, target.id), eq(chatMessages.userId, user.id)))
            await db
              .delete(chatMessages)
              .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.userId, user.id), afterTarget))
            const inserted = await db
              .insert(chatMessages)
              .values({ conversationId, userId: user.id, role: 'assistant', content: text, attachments })
              .returning({ id: chatMessages.id })
            await db
              .update(chatConversations)
              .set({
                ...(autoTitle ? { title: deriveTitle(content) } : {}),
                updatedAt: new Date().toISOString(),
              })
              .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, user.id)))
            return inserted
          })
          return row[0].id
        },
      })
    )
  } catch (error) {
    console.error('PATCH /api/modules/chat/conversations/[id]/messages/[messageId] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
