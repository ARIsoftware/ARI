/**
 * Board of Advisors — the roundtable.
 * POST /api/modules/board-of-advisors/conversations/{id}/messages
 *
 * Persists the user's question, then runs one roundtable round: every advisor
 * speaks once, in speaking order, streamed to the client as Server-Sent
 * Events. Each advisor is prompted with the full discussion transcript —
 * including the advisors who already spoke this round — so later speakers can
 * agree, push back, or build on earlier ones.
 *
 * Events:
 *   data: {"type":"user_message_id","id":"..."}
 *   data: {"type":"advisor_start","advisor":{"id":"...","name":"...","color":"..."}}
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"advisor_done","message_id":"...","content":"...","partial":true?}
 *   data: {"type":"error","error":"..."}          (ends the round)
 *   data: {"type":"done","title":"..."?}          (round complete; title set on first exchange)
 */

import { NextRequest } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validatePathParams, createErrorResponse } from '@/lib/api-helpers'
import {
  askBoardSchema,
  conversationIdParamSchema,
} from '@/modules/board-of-advisors/lib/validation'
import {
  ProviderError,
  readIntegrationSettings,
  resolveBoardProviderFrom,
  streamCompletion,
} from '@/modules/board-of-advisors/lib/providers'
import { checkRateLimit } from '@/lib/modules/public-route-security'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { boardAdvisors, boardConversations, boardMessages, moduleSettings } from '@/lib/db/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { AiProviderId, BoardSettings } from '@/modules/board-of-advisors/types'

/** Character budget for the transcript sent to each advisor. */
const TRANSCRIPT_MAX_CHARS = 24000
/** Newest history rows loaded per question; older turns fall out of context. */
const HISTORY_MAX_ROWS = 200
/** The DB default title — a conversation still carrying it gets auto-titled. */
const UNTITLED = 'New discussion'
/** Questions per user per minute. Each question fans out to one LLM call per
 *  advisor, so this bounds the cost amplification of the roundtable. */
const QUESTIONS_PER_MINUTE = 6

/** One roundtable at a time per user (per server instance — best effort). */
const inFlightRounds = new Set<string>()

registry.registerPath({
  method: 'post',
  path: '/api/modules/board-of-advisors/conversations/{id}/messages',
  operationId: 'askBoardOfAdvisors',
  summary: 'Ask the board a question; every advisor replies in turn, streamed via Server-Sent Events',
  description: 'Returns a `text/event-stream`. Events: `user_message_id`, `advisor_start`, `delta`, `advisor_done`, `error`, `done`.',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { params: conversationIdParamSchema, body: { content: { 'application/json': { schema: askBoardSchema } } } },
  responses: {
    200: { description: 'SSE stream of the roundtable', content: { 'text/event-stream': { schema: z.string() } } },
    400: { description: 'Validation error or empty board', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Conversation not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    412: { description: 'Provider not configured', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'A roundtable is already running, or the per-minute question limit was reached', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

/** Only pass provider-originated errors to the client; anything else (DB,
 *  pool, code bugs) gets a generic message like every other route. */
function clientSafeError(err: unknown): string {
  if (err instanceof ProviderError) return err.message
  return 'Something went wrong while running the roundtable. Please try again.'
}

/** Postgres foreign-key violation (e.g. advisor deleted mid-round). */
function isForeignKeyViolation(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code
  return code === '23503'
}

interface TranscriptEntry {
  speaker: string
  content: string
}

/**
 * Render the discussion as a labeled transcript, trimming the oldest entries
 * to stay within budget. The newest entries (the current question and this
 * round's replies) are always kept.
 */
function renderTranscript(entries: TranscriptEntry[]): string {
  const rendered: string[] = []
  let total = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    const block = `${entries[i].speaker}: ${entries[i].content}`
    if (total + block.length > TRANSCRIPT_MAX_CHARS && rendered.length > 0) break
    rendered.unshift(block)
    total += block.length
  }
  return rendered.join('\n\n')
}

interface AdvisorSeat {
  id: string
  name: string
  description: string
  color: string
}

function buildSystemPrompt(advisor: AdvisorSeat, allAdvisors: AdvisorSeat[]): string {
  const others = allAdvisors.filter((a) => a.id !== advisor.id).map((a) => a.name)
  return [
    `You are ${advisor.name}, a member of the user's personal Board of Advisors — a roundtable of distinct personas who each weigh in on the user's questions.`,
    '',
    'YOUR PERSONA:',
    advisor.description,
    '',
    'RULES:',
    `- Always stay in character as ${advisor.name}. Speak in first person, in that persona's voice, values, and expertise.`,
    others.length > 0
      ? `- The other advisors at the table: ${others.join(', ')}.`
      : '- You are currently the only advisor at the table.',
    '- The transcript shows the discussion so far. When other advisors have already spoken on the current question, react to their takes — agree, disagree, or build on them, addressing them by name — rather than repeating the same points.',
    '- Give practical, concrete counsel grounded in how your persona thinks. Take a clear position.',
    '- Keep your reply to a few tight paragraphs unless the user asks for depth.',
    '- Never speak for anyone else, never narrate the meeting, and never mention being an AI.',
    '- Do not prefix your reply with your name — the interface labels it for you.',
  ].join('\n')
}

function buildAdvisorPrompt(advisorName: string, transcript: TranscriptEntry[]): string {
  return [
    'BOARD DISCUSSION TRANSCRIPT:',
    '',
    renderTranscript(transcript),
    '',
    '---',
    '',
    `It is now your turn to speak as ${advisorName}. Respond to the discussion above.`,
  ].join('\n')
}

function providerErrorMessage(reason: 'none' | 'unsupported' | 'nokey', providerName: string): string {
  if (reason === 'none') return 'No AI provider selected. Pick one in Board of Advisors → Settings.'
  if (reason === 'unsupported') return `${providerName} can't power the board — pick a language-model provider in Board of Advisors → Settings.`
  return `${providerName} has no API key configured. Add it in Settings → Integrations.`
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = validatePathParams(await context.params, conversationIdParamSchema)
    if (!params.success) return params.response
    const conversationId = params.data.id

    const validation = await validateRequestBody(request, askBoardSchema)
    if (!validation.success) return validation.response
    const question = validation.data.content

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    // One roundtable at a time — each question fans out to one LLM call per
    // advisor, so this route is the cost-amplifying one. The lock is taken
    // immediately (no awaits between check and add, closing the double-submit
    // window) and released in the finally below unless the stream takes
    // ownership; from then on the stream's close() releases it.
    if (inFlightRounds.has(user.id)) {
      return createErrorResponse('A roundtable is already running. Wait for it to finish (or stop it) before asking again.', 429)
    }
    inFlightRounds.add(user.id)
    let lockTransferredToStream = false
    try {

    // Pre-stream reads: ownership check, board roster, module settings, and
    // recent history in one transaction — the integrations blob (other pool)
    // in parallel, since it only depends on the user id.
    const [prepared, integrations] = await Promise.all([
      withRLS(async (db) => {
        const convo = await db
          .select()
          .from(boardConversations)
          .where(and(eq(boardConversations.id, conversationId), eq(boardConversations.userId, user.id)))
          .limit(1)
        if (convo.length === 0) return { kind: 'not_found' as const }

        const advisors = await db
          .select()
          .from(boardAdvisors)
          .where(eq(boardAdvisors.userId, user.id))
          .orderBy(asc(boardAdvisors.sortOrder), asc(boardAdvisors.createdAt))
        if (advisors.length === 0) return { kind: 'no_advisors' as const }

        const settingsRows = await db
          .select({ settings: moduleSettings.settings })
          .from(moduleSettings)
          .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, 'board-of-advisors')))
          .limit(1)

        // Newest rows first, capped, then restored to chronological order. The
        // new question is appended locally instead of being re-read.
        const historyDesc = await db
          .select()
          .from(boardMessages)
          .where(and(eq(boardMessages.conversationId, conversationId), eq(boardMessages.userId, user.id)))
          .orderBy(desc(boardMessages.createdAt), desc(boardMessages.id))
          .limit(HISTORY_MAX_ROWS)

        return {
          kind: 'ok' as const,
          conversation: convo[0],
          advisors,
          settings: (settingsRows[0]?.settings ?? {}) as Partial<BoardSettings>,
          history: historyDesc.reverse(),
        }
      }),
      readIntegrationSettings(user.id),
    ])

    if (prepared.kind === 'not_found') {
      return createErrorResponse('Conversation not found', 404)
    }
    if (prepared.kind === 'no_advisors') {
      return createErrorResponse('Add at least one advisor in Board of Advisors → Settings before asking a question.', 400)
    }
    const { conversation, advisors, settings, history } = prepared

    // Resolve the provider BEFORE persisting anything: a 412 must not leave an
    // orphaned question in the thread (or burn a rate-limit token).
    const resolved = resolveBoardProviderFrom(
      integrations,
      (settings.selectedAiProvider ?? null) as AiProviderId | null,
      settings.aiProviderModels,
    )
    if (!resolved.ok) {
      return createErrorResponse(providerErrorMessage(resolved.reason, resolved.providerName), 412)
    }

    if (!checkRateLimit(`board-of-advisors:ask:${user.id}`, QUESTIONS_PER_MINUTE)) {
      return createErrorResponse('Too many questions in a short time. Give the board a minute to catch its breath.', 429)
    }

    // If the previous round failed before any advisor replied, the user's
    // question is already the newest persisted row — reuse it instead of
    // inserting a duplicate on retry.
    const newestRow = history[history.length - 1]
    const isRetryOfUnanswered =
      !!newestRow && newestRow.role === 'user' && newestRow.content === question

    let userMessage: (typeof history)[number]
    if (isRetryOfUnanswered) {
      userMessage = newestRow
    } else {
      // All preflights passed — persist the question and bump activity.
      userMessage = await withRLS(async (db) => {
        const inserted = await db
          .insert(boardMessages)
          .values({
            conversationId,
            userId: user.id,
            role: 'user',
            content: question,
          })
          .returning()

        await db
          .update(boardConversations)
          .set({ updatedAt: sql`now()` })
          .where(and(eq(boardConversations.id, conversationId), eq(boardConversations.userId, user.id)))

        return inserted[0]
      })
    }

    const transcript: TranscriptEntry[] = history.map((m) => ({
      speaker: m.role === 'user' ? 'User' : (m.advisorName ?? 'Advisor'),
      content: m.content,
    }))
    // On reuse the question is already the last history entry — don't double it.
    if (!isRetryOfUnanswered) transcript.push({ speaker: 'User', content: question })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      // No cancel() lock release: a client disconnect aborts the provider
      // fetch via request.signal, and start() always reaches close() — which
      // releases the lock only after the partial reply is persisted.
      async start(controller) {
        // enqueue throws once the client disconnects; from then on emits are
        // no-ops so persistence still completes.
        let closed = false
        const emit = (payload: Record<string, unknown>) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(sseEvent(payload)))
          } catch {
            closed = true
          }
        }
        const close = () => {
          inFlightRounds.delete(user.id)
          if (closed) return
          closed = true
          try {
            controller.close()
          } catch {
            // Already closed by the runtime.
          }
        }

        const persistAdvisorReply = async (advisor: AdvisorSeat, content: string) => {
          const baseValues = {
            conversationId,
            userId: user.id,
            role: 'advisor',
            advisorName: advisor.name,
            advisorColor: advisor.color,
            content,
          }
          try {
            const rows = await withRLS((db) =>
              db.insert(boardMessages).values({ ...baseValues, advisorId: advisor.id }).returning()
            )
            return rows[0]
          } catch (err) {
            // Advisor deleted mid-round: the FK insert fails, but the reply is
            // still worth keeping — the name/color snapshots carry the display.
            if (!isForeignKeyViolation(err)) throw err
            const rows = await withRLS((db) =>
              db.insert(boardMessages).values({ ...baseValues, advisorId: null }).returning()
            )
            return rows[0]
          }
        }

        try {
          emit({ type: 'user_message_id', id: userMessage.id })

          for (const advisor of advisors) {
            emit({ type: 'advisor_start', advisor: { id: advisor.id, name: advisor.name, color: advisor.color } })

            let replyText = ''
            try {
              for await (const delta of streamCompletion({
                provider: resolved.provider,
                model: resolved.modelId,
                apiKey: resolved.apiKey,
                system: buildSystemPrompt(advisor, advisors),
                prompt: buildAdvisorPrompt(advisor.name, transcript),
                signal: request.signal,
              })) {
                replyText += delta
                emit({ type: 'delta', text: delta })
              }
            } catch (err) {
              console.error('[board-of-advisors] stream error:', err instanceof Error ? err.message : err)
              // Keep whatever this advisor managed to say so the round isn't
              // lost. The cut-short marker travels in the content itself, so
              // it survives refetches (there is no "partial" column).
              if (replyText.trim()) {
                const partialContent = `${replyText.trimEnd()}\n\n*(reply cut short)*`
                try {
                  const partial = await persistAdvisorReply(advisor, partialContent)
                  emit({ type: 'advisor_done', message_id: partial.id, content: partialContent, partial: true })
                } catch (persistErr) {
                  console.error('[board-of-advisors] failed to persist partial reply:', persistErr instanceof Error ? persistErr.message : persistErr)
                }
              }
              emit({ type: 'error', error: clientSafeError(err) })
              close()
              return
            }

            if (!replyText.trim()) replyText = '(no reply)'

            try {
              const row = await persistAdvisorReply(advisor, replyText)
              emit({ type: 'advisor_done', message_id: row.id, content: replyText })
            } catch (err) {
              console.error('[board-of-advisors] failed to persist advisor reply:', err instanceof Error ? err.message : err)
              emit({ type: 'error', error: 'Failed to save the advisor reply' })
              close()
              return
            }

            // Later advisors see this reply in their transcript.
            transcript.push({ speaker: advisor.name, content: replyText })
          }

          let newTitle: string | undefined
          if (conversation.title === UNTITLED) {
            const candidate = question.slice(0, 60).trim() || UNTITLED
            try {
              // Guarded on the CURRENT title, not the pre-round snapshot — a
              // rename made while the round streamed must not be clobbered.
              const updated = await withRLS((db) =>
                db
                  .update(boardConversations)
                  .set({ title: candidate, updatedAt: sql`now()` })
                  .where(and(
                    eq(boardConversations.id, conversationId),
                    eq(boardConversations.userId, user.id),
                    eq(boardConversations.title, UNTITLED),
                  ))
                  .returning({ id: boardConversations.id })
              )
              if (updated.length > 0) newTitle = candidate
            } catch (err) {
              console.error('[board-of-advisors] failed to auto-title:', err instanceof Error ? err.message : err)
            }
          }

          emit({ type: 'done', ...(newTitle ? { title: newTitle } : {}) })
        } catch (err) {
          console.error('[board-of-advisors] roundtable failed:', err instanceof Error ? err.message : err)
          emit({ type: 'error', error: 'Something went wrong while running the roundtable. Please try again.' })
        }
        close()
      },
    })

    lockTransferredToStream = true
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Reverse proxies (nginx) buffer streaming responses by default,
        // which would hold the whole roundtable until it finishes.
        'X-Accel-Buffering': 'no',
      },
    })

    } finally {
      if (!lockTransferredToStream) inFlightRounds.delete(user.id)
    }
  } catch (error) {
    console.error('POST /api/modules/board-of-advisors/conversations/[id]/messages error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
