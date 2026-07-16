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
import { getProviderApiKey, streamChat } from '@/modules/chat/lib/providers'
import type { ChatAttachment, ChatMessage, ChatProvider } from '@/modules/chat/types'

// Streamed LLM calls are expensive — cap sends per user per minute.
const SEND_RATE_LIMIT_PER_MIN = 20
// Trailing window of messages sent to the provider. Older turns stay in the
// DB and UI but are not re-sent, keeping token cost and latency bounded.
const HISTORY_WINDOW = 50

// Derive a rename-safe title from a user message: strip the characters that
// safeText() (used by the rename route) rejects so the auto-title can always
// be edited later, and collapse whitespace/newlines.
function deriveTitle(content: string): string {
  return content.replace(/[<>\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat'
}

registry.registerPath({
  method: 'post',
  path: '/api/modules/chat/conversations/{id}/messages',
  operationId: 'sendChatMessage',
  summary: 'Append a user message and stream the assistant reply via Server-Sent Events',
  description: 'Returns a `text/event-stream`. Events: `data: {"type":"delta","text":"..."}`, `data: {"type":"done","message_id":"...","content":"..."}`, or `data: {"type":"error","error":"..."}`.',
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

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

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

  if (!checkRateLimit(`chat-send:${user.id}`, SEND_RATE_LIMIT_PER_MIN)) {
    return createErrorResponse('Too many messages. Please wait a moment and try again.', 429)
  }

  const validation = await validateRequestBody(request, sendMessageSchema)
  if (!validation.success) return validation.response
  const content = validation.data.content

  const convo = await withRLS((db) =>
    db
      .select({ provider: chatConversations.provider, model: chatConversations.model })
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

  // First exchange = the conversation has no assistant/system turns yet.
  const isFirstExchange = prior.every((m) => m.role === 'user')

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

  const history: ChatMessage[] = windowRows.map((m) => ({
    id: m.id,
    conversation_id: m.conversationId,
    user_id: m.userId,
    role: m.role as ChatMessage['role'],
    content: m.content,
    attachments: (m.attachments as ChatAttachment[]) ?? [],
    created_at: m.createdAt,
  }))

  const encoder = new TextEncoder()
  // Aborts the upstream provider request when the client disconnects, so we
  // stop consuming (and paying for) tokens once nobody is listening.
  const abort = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const safeEnqueue = (payload: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(sseEvent(payload)))
        } catch {
          closed = true
        }
      }
      const safeClose = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // already closed by the runtime (client gone) — nothing to do.
        }
      }

      const persistAssistant = async (text: string, partial: boolean) => {
        const row = await withRLS((db) =>
          db
            .insert(chatMessages)
            .values({ conversationId, userId: user.id, role: 'assistant', content: text, attachments: [] })
            .returning()
        )
        if (isFirstExchange) {
          await withRLS((db) =>
            db
              .update(chatConversations)
              .set({ title: deriveTitle(content), updatedAt: new Date().toISOString() })
              .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, user.id)))
          )
        }
        safeEnqueue({ type: 'done', message_id: row[0].id, content: text, ...(partial ? { partial: true } : {}) })
      }

      safeEnqueue({ type: 'user_message_id', id: userTurnId })

      let assistantText = ''
      try {
        for await (const delta of streamChat({
          userId: user.id,
          provider,
          model: conversation.model,
          history,
          apiKey,
          signal: abort.signal,
        })) {
          assistantText += delta
          safeEnqueue({ type: 'delta', text: delta })
          if (closed) break // client disconnected — stop pulling from the provider
        }
      } catch (err) {
        // A client-initiated abort is expected teardown, not an error.
        if (!abort.signal.aborted) {
          const message = err instanceof Error ? err.message : 'Unknown provider error'
          console.error('[chat] stream error:', message)
          safeEnqueue({ type: 'error', error: message })
        }
        // Persist whatever partial reply we collected so it survives a reload.
        if (assistantText) {
          try {
            await persistAssistant(assistantText, true)
          } catch (persistErr) {
            console.error('[chat] failed to persist partial assistant reply:', persistErr instanceof Error ? persistErr.message : persistErr)
          }
        }
        safeClose()
        return
      }

      try {
        await persistAssistant(assistantText, false)
      } catch (err) {
        console.error('[chat] failed to persist assistant reply:', err instanceof Error ? err.message : err)
        safeEnqueue({ type: 'error', error: 'Failed to save assistant reply' })
      }

      safeClose()
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
