/**
 * Server-Sent Events stream for one assistant reply, shared by the send,
 * regenerate and edit routes. The provider call and the DB write are injected
 * so the framing / abort / partial-persist behaviour is unit-tested without a
 * database or a live provider.
 *
 * Events: `user_message_id` (the turn being answered), `delta` (text),
 * `status` (a long step is running, e.g. generating an image), `done`
 * (persisted id + full text, `partial` when cut short) and `error`.
 */

import type { ChatAttachment } from '../types'

/** What a reply generator yields: text, a status line, or a finished attachment. */
export type ReplyChunk =
  | string
  | { type: 'status'; text: string }
  | { type: 'attachment'; attachment: ChatAttachment }

export interface ReplyStreamOptions {
  /** Id of the user turn this reply answers — sent first so the client can reconcile. */
  userTurnId: string
  /** Yields the reply (text deltas, statuses, attachments); must honour `signal`. */
  generate: (signal: AbortSignal) => AsyncIterable<ReplyChunk>
  /** Persists the reply and returns its message id. */
  persist: (text: string, partial: boolean, attachments: ChatAttachment[]) => Promise<string>
  /** Server-side log hook (defaults to console.error). */
  log?: (message: string) => void
}

export function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export function createReplyStream(opts: ReplyStreamOptions): ReadableStream<Uint8Array> {
  const log = opts.log ?? ((message: string) => console.error(message))
  const encoder = new TextEncoder()
  // Aborts the upstream provider request when the client disconnects (or
  // presses Stop), so we stop consuming — and paying for — tokens once
  // nobody is listening.
  const abort = new AbortController()

  return new ReadableStream<Uint8Array>({
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
      const attachments: ChatAttachment[] = []
      const persist = async (text: string, partial: boolean) => {
        const id = await opts.persist(text, partial, attachments)
        safeEnqueue({ type: 'done', message_id: id, content: text, ...(partial ? { partial: true } : {}) })
      }

      safeEnqueue({ type: 'user_message_id', id: opts.userTurnId })

      let text = ''
      try {
        for await (const chunk of opts.generate(abort.signal)) {
          if (typeof chunk === 'string') {
            text += chunk
            safeEnqueue({ type: 'delta', text: chunk })
          } else if (chunk.type === 'status') {
            safeEnqueue({ type: 'status', text: chunk.text })
          } else {
            attachments.push(chunk.attachment)
          }
          if (closed) break // client disconnected — stop pulling from the provider
        }
      } catch (err) {
        // A client-initiated abort is expected teardown, not an error.
        if (!abort.signal.aborted) {
          const message = err instanceof Error ? err.message : 'Unknown provider error'
          log(`[chat] stream error: ${message}`)
          safeEnqueue({ type: 'error', error: message })
        }
        // Persist whatever partial reply we collected so it survives a reload.
        if (text || attachments.length > 0) {
          try {
            await persist(text, true)
          } catch (persistErr) {
            log(`[chat] failed to persist partial assistant reply: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`)
          }
        }
        safeClose()
        return
      }

      try {
        // A reply the client stopped mid-way is still saved, marked partial.
        await persist(text, closed)
      } catch (err) {
        log(`[chat] failed to persist assistant reply: ${err instanceof Error ? err.message : String(err)}`)
        safeEnqueue({ type: 'error', error: 'Failed to save assistant reply' })
      }

      safeClose()
    },
    cancel() {
      abort.abort()
    },
  })
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
