import { NextRequest } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validatePathParams, createErrorResponse } from '@/lib/api-helpers'
import { chatIdParamSchema } from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { chatConversations, chatMessages } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
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
  planRegenerate,
  shouldAutoTitle,
  toChatMessage,
} from '@/modules/chat/lib/turns'
import type { ChatProvider } from '@/modules/chat/types'

registry.registerPath({
  method: 'post',
  path: '/api/modules/chat/conversations/{id}/regenerate',
  operationId: 'regenerateChatReply',
  summary: 'Replace the latest assistant reply with a new one, streamed via Server-Sent Events',
  description: 'Answers the most recent user turn again (with the conversation\'s current provider/model). The previous reply is replaced only when the new one is saved (a failed regenerate keeps it). Same event stream as sendChatMessage.',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { params: chatIdParamSchema },
  responses: {
    200: { description: 'SSE stream of assistant reply', content: { 'text/event-stream': { schema: z.string() } } },
    400: { description: 'Nothing to regenerate', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    412: { description: 'Provider not configured', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const parsedId = validatePathParams(await context.params, chatIdParamSchema)
    if (!parsedId.success) return parsedId.response
    const conversationId = parsedId.data.id

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    if (!checkRateLimit(REPLY_RATE_LIMIT_KEY(user.id), REPLY_RATE_LIMIT_PER_MIN)) {
      return createErrorResponse('Too many messages. Please wait a moment and try again.', 429)
    }

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

    const priorDesc = await withRLS((db) =>
      db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.userId, user.id)))
        .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
        .limit(HISTORY_WINDOW)
    )
    const plan = planRegenerate(priorDesc.reverse())
    if (!plan) return createErrorResponse('There is no message to answer yet', 400)

    const history = plan.history.map(toChatMessage)
    const autoTitle = isFirstExchange(history) && shouldAutoTitle(conversation.title)

    return sseResponse(
      createReplyStream({
        userTurnId: plan.userTurn.id,
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
          // Swap the old reply for the new one in one transaction, and only
          // once there is something to save — a failed regenerate keeps it.
          const row = await withRLS(async (db) => {
            if (plan.deleteIds.length > 0) {
              await db
                .delete(chatMessages)
                .where(
                  and(
                    inArray(chatMessages.id, plan.deleteIds),
                    eq(chatMessages.conversationId, conversationId),
                    eq(chatMessages.userId, user.id)
                  )
                )
            }
            const inserted = await db
              .insert(chatMessages)
              .values({ conversationId, userId: user.id, role: 'assistant', content: text, attachments })
              .returning({ id: chatMessages.id })
            await db
              .update(chatConversations)
              .set({
                ...(autoTitle ? { title: deriveTitle(plan.userTurn.content) } : {}),
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
    console.error('POST /api/modules/chat/conversations/[id]/regenerate error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
