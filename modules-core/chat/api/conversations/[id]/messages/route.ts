import { NextRequest } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validatePathParams, createErrorResponse } from '@/lib/api-helpers'
import { sendMessageSchema, chatIdParamSchema } from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { chatConversations, chatMessages, chatUploads } from '@/lib/db/schema'
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
  shouldAutoTitle,
  toChatMessage,
} from '@/modules/chat/lib/turns'
import type { ChatAttachment, ChatProvider } from '@/modules/chat/types'


registry.registerPath({
  method: 'post',
  path: '/api/modules/chat/conversations/{id}/messages',
  operationId: 'sendChatMessage',
  summary: 'Append a user message and stream the assistant reply via Server-Sent Events',
  description: 'Returns a `text/event-stream`. Events: `data: {"type":"delta","text":"..."}`, `data: {"type":"status","text":"Generating image…"}`, `data: {"type":"done","message_id":"...","content":"..."}`, or `data: {"type":"error","error":"..."}`.',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { params: chatIdParamSchema, body: { content: { 'application/json': { schema: sendMessageSchema } } } },
  responses: {
    200: { description: 'SSE stream of assistant reply', content: { 'text/event-stream': { schema: z.string() } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    412: { description: 'Provider not configured', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const parsedId = validatePathParams(await context.params, chatIdParamSchema)
  if (!parsedId.success) return parsedId.response
  const conversationId = parsedId.data.id

  // Authenticate before parsing the (up to 50KB) body.
  const { user, withRLS } = await getAuthenticatedUser()
  if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

  if (!checkRateLimit(REPLY_RATE_LIMIT_KEY(user.id), REPLY_RATE_LIMIT_PER_MIN)) {
    return createErrorResponse('Too many messages. Please wait a moment and try again.', 429)
  }

  const validation = await validateRequestBody(request, sendMessageSchema)
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

  // Validate attached uploads actually belong to this user, then rebuild the
  // attachment metadata from the owned rows. Client-supplied filename/bucket/
  // mime must never be persisted or passed to storage — only upload_id is
  // trusted as an identifier.
  const requestedIds = [...new Set((validation.data.attachments ?? []).map((a) => a.upload_id))]
  let attachments: ChatAttachment[] = []
  if (requestedIds.length > 0) {
    const owned = await withRLS((db) =>
      db
        .select()
        .from(chatUploads)
        .where(and(inArray(chatUploads.id, requestedIds), eq(chatUploads.userId, user.id)))
    )
    if (owned.length !== requestedIds.length) {
      return createErrorResponse('One or more attachments are invalid', 400)
    }
    const byId = new Map(owned.map((u) => [u.id, u]))
    attachments = requestedIds.map((id) => {
      const row = byId.get(id)!
      return {
        upload_id: row.id,
        filename: row.filename,
        original_name: row.originalName,
        mime: row.mime,
        size: row.size,
        bucket: row.bucket,
      }
    })
  }

  // Load the trailing window (chronological, with a stable id tie-breaker for
  // equal timestamps) BEFORE inserting, so we can (a) detect a retry of an
  // as-yet-unanswered user turn and reuse it instead of duplicating, and
  // (b) decide first-exchange auto-titling reliably even after a failed send.
  const priorDesc = await withRLS((db) =>
    db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.userId, user.id)))
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(HISTORY_WINDOW)
  )
  const prior = priorDesc.reverse() // chronological
  const newest = prior[prior.length - 1]
  const isRetryOfUnanswered = !!newest && newest.role === 'user' && newest.content === content

  let userTurnId: string
  let windowRows = prior
  if (isRetryOfUnanswered) {
    // The user turn is already persisted (a previous send failed before the
    // assistant replied) — reuse it rather than inserting a duplicate.
    userTurnId = newest.id
  } else {
    // Insert the user turn and bump conversation activity in one transaction.
    const inserted = await withRLS(async (db) => {
      const [row] = await db
        .insert(chatMessages)
        .values({ conversationId, userId: user.id, role: 'user', content, attachments })
        .returning()
      await db
        .update(chatConversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, user.id)))
      return row
    })
    userTurnId = inserted.id
    windowRows = [...prior, inserted].slice(-HISTORY_WINDOW)
  }

  const history = windowRows.map(toChatMessage)

  const autoTitle = isFirstExchange(prior) && shouldAutoTitle(conversation.title)

  return sseResponse(
    createReplyStream({
      userTurnId,
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
        const row = await withRLS((db) =>
          db
            .insert(chatMessages)
            .values({ conversationId, userId: user.id, role: 'assistant', content: text, attachments })
            .returning({ id: chatMessages.id })
        )
        if (autoTitle) {
          await withRLS((db) =>
            db
              .update(chatConversations)
              .set({ title: deriveTitle(content), updatedAt: new Date().toISOString() })
              .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, user.id)))
          )
        }
        return row[0].id
      },
    })
  )
}

