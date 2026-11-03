/**
 * Tests for modules-core/chat/lib/reply-stream.ts — SSE framing, persisting
 * complete and partial replies, provider errors, and client cancellation.
 */
import { describe, it, expect, vi } from 'vitest'
import { createReplyStream, sseEvent, sseResponse } from '@/modules-core/chat/lib/reply-stream'

type Event = Record<string, unknown>

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Event[]> {
  const text = await new Response(stream).text()
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, '')))
}

async function* chunks(...parts: string[]) {
  for (const p of parts) yield p
}

describe('sseEvent', () => {
  it('frames a payload as one data event', () => {
    expect(sseEvent({ type: 'delta', text: 'a' })).toBe('data: {"type":"delta","text":"a"}\n\n')
  })
})

describe('sseResponse', () => {
  it('sets event-stream headers', () => {
    const res = sseResponse(new ReadableStream())
    expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform')
  })
})

describe('createReplyStream', () => {
  it('streams deltas, persists the full reply, and reports its id', async () => {
    const persist = vi.fn().mockResolvedValue('msg-1')
    const events = await readAll(
      createReplyStream({ userTurnId: 'u1', generate: () => chunks('Hel', 'lo'), persist }),
    )
    expect(events).toEqual([
      { type: 'user_message_id', id: 'u1' },
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'done', message_id: 'msg-1', content: 'Hello' },
    ])
    expect(persist).toHaveBeenCalledWith('Hello', false, [])
  })

  it('reports a provider error and saves the partial reply', async () => {
    const log = vi.fn()
    const persist = vi.fn().mockResolvedValue('msg-2')
    async function* failing() {
      yield 'Part'
      throw new Error('rate limited')
    }
    const events = await readAll(createReplyStream({ userTurnId: 'u1', generate: failing, persist, log }))
    expect(events).toContainEqual({ type: 'error', error: 'rate limited' })
    expect(events).toContainEqual({ type: 'done', message_id: 'msg-2', content: 'Part', partial: true })
    expect(persist).toHaveBeenCalledWith('Part', true, [])
    expect(log).toHaveBeenCalledWith('[chat] stream error: rate limited')
  })

  it('does not persist when a failure produced no text', async () => {
    const persist = vi.fn()
    async function* failing(): AsyncGenerator<string> {
      throw 'boom'
    }
    const events = await readAll(createReplyStream({ userTurnId: 'u1', generate: failing, persist, log: () => {} }))
    expect(events).toContainEqual({ type: 'error', error: 'Unknown provider error' })
    expect(persist).not.toHaveBeenCalled()
  })

  it('logs (and does not throw) when saving a partial reply fails', async () => {
    const log = vi.fn()
    async function* failing() {
      yield 'Part'
      throw new Error('x')
    }
    const persist = vi.fn().mockRejectedValue('db down')
    await readAll(createReplyStream({ userTurnId: 'u1', generate: failing, persist, log }))
    expect(log).toHaveBeenCalledWith('[chat] failed to persist partial assistant reply: db down')
  })

  it('reports a failed save of a complete reply', async () => {
    const log = vi.fn()
    const persist = vi.fn().mockRejectedValue(new Error('db down'))
    const events = await readAll(createReplyStream({ userTurnId: 'u1', generate: () => chunks('ok'), persist, log }))
    expect(events).toContainEqual({ type: 'error', error: 'Failed to save assistant reply' })
    expect(log).toHaveBeenCalledWith('[chat] failed to persist assistant reply: db down')
  })

  it('stringifies non-Error save failures', async () => {
    const log = vi.fn()
    const persist = vi.fn().mockRejectedValue('nope')
    await readAll(createReplyStream({ userTurnId: 'u1', generate: () => chunks('ok'), persist, log }))
    expect(log).toHaveBeenCalledWith('[chat] failed to persist assistant reply: nope')
  })

  it('logs to console.error by default', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    async function* failing(): AsyncGenerator<string> {
      throw new Error('bad')
    }
    await readAll(createReplyStream({ userTurnId: 'u1', generate: failing, persist: vi.fn() }))
    expect(spy).toHaveBeenCalledWith('[chat] stream error: bad')
    spy.mockRestore()
  })

  it('aborts the provider on cancel and saves what arrived, silently', async () => {
    const persist = vi.fn().mockResolvedValue('msg-3')
    const log = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let seenSignal: AbortSignal | undefined
    async function* slow(signal: AbortSignal) {
      seenSignal = signal
      yield 'Half'
      await gate
      if (signal.aborted) throw new Error('aborted')
      yield 'never'
    }
    const stream = createReplyStream({ userTurnId: 'u1', generate: slow, persist, log })
    const reader = stream.getReader()
    await reader.read() // user_message_id
    await reader.read() // delta "Half"
    await reader.cancel()
    release()
    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith('Half', true, []))
    expect(seenSignal?.aborted).toBe(true)
    expect(log).not.toHaveBeenCalled()
  })

  it('stops pulling and marks the reply partial when the stream is closed mid-way', async () => {
    const persist = vi.fn().mockResolvedValue('msg-4')
    const pulled: string[] = []
    async function* many() {
      for (const p of ['a', 'b', 'c']) {
        pulled.push(p)
        yield p
      }
    }
    // A controller whose enqueue throws after the first delta simulates the
    // runtime closing the stream without calling cancel().
    const OriginalStream = globalThis.ReadableStream
    let enqueues = 0
    class ClosingStream<T> extends OriginalStream<T> {
      constructor(source: UnderlyingDefaultSource<T>) {
        super({
          ...source,
          start: (controller) =>
            source.start?.({
              ...controller,
              enqueue: (chunk: T) => {
                enqueues++
                if (enqueues > 2) throw new Error('closed')
                controller.enqueue(chunk)
              },
              close: () => controller.close(),
              error: (e: unknown) => controller.error(e),
              desiredSize: controller.desiredSize,
            } as ReadableStreamDefaultController<T>),
        })
      }
    }
    globalThis.ReadableStream = ClosingStream as unknown as typeof ReadableStream
    try {
      const stream = createReplyStream({ userTurnId: 'u1', generate: many, persist })
      // The runtime "closed" it, so the stream never ends on our side — just drain what arrives.
      const reader = stream.getReader()
      void reader.read().then(() => reader.read())
      await vi.waitFor(() => expect(persist).toHaveBeenCalled())
    } finally {
      globalThis.ReadableStream = OriginalStream
    }
    expect(pulled).toEqual(['a', 'b'])
    expect(persist).toHaveBeenCalledWith('ab', true, [])
  })
})

describe('createReplyStream — statuses and attachments', () => {
  const ATT = { upload_id: 'up-1', filename: 'f.png', original_name: 'a cat', mime: 'image/png', size: 3, bucket: 'chat' }

  it('forwards status events and persists attachments with the reply', async () => {
    const persist = vi.fn().mockResolvedValue('msg-9')
    async function* gen() {
      yield 'Here you go.'
      yield { type: 'status' as const, text: 'Generating image…' }
      yield { type: 'attachment' as const, attachment: ATT }
    }
    const events = await readAll(createReplyStream({ userTurnId: 'u1', generate: gen, persist }))
    expect(events).toEqual([
      { type: 'user_message_id', id: 'u1' },
      { type: 'delta', text: 'Here you go.' },
      { type: 'status', text: 'Generating image…' },
      { type: 'done', message_id: 'msg-9', content: 'Here you go.' },
    ])
    expect(persist).toHaveBeenCalledWith('Here you go.', false, [ATT])
  })

  it('saves an image-only reply as partial when a later step fails', async () => {
    const persist = vi.fn().mockResolvedValue('msg-10')
    async function* gen() {
      yield { type: 'attachment' as const, attachment: ATT }
      throw new Error('second image failed')
    }
    const events = await readAll(
      createReplyStream({ userTurnId: 'u1', generate: gen, persist, log: () => {} })
    )
    expect(events).toContainEqual({ type: 'error', error: 'second image failed' })
    expect(persist).toHaveBeenCalledWith('', true, [ATT])
  })
})
