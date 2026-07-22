/**
 * Extra coverage for board-of-advisors/lib/providers.ts.
 *
 * Targets:
 * - line 331: httpProviderError catch branch when res.text() throws
 * - remaining branch coverage in streamCompletion (gemini path, oversized buffer)
 * - resolveBoardProviderFrom: unknown provider (not in registry)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  withAdminDb: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => `decrypted:${v}`),
  isEncrypted: vi.fn((v: unknown) => typeof v === 'string' && v.startsWith('enc:')),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ eq: true })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

import {
  resolveBoardProviderFrom,
  ProviderError,
  streamCompletion,
} from '@/modules-core/board-of-advisors/lib/providers'

function makeErrorHttpResponseWithThrowingText(status: number): Response {
  return {
    ok: false,
    status,
    body: null,
    text: async () => { throw new Error('cannot read body') },
  } as unknown as Response
}

function makeSSEStream(lines: string[]): Response {
  const encoder = new TextEncoder()
  const data = lines.join('\n') + '\n'
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(data))
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => data,
  } as unknown as Response
}

function makeErrorHttpResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    body: null,
    text: async () => body,
  } as unknown as Response
}

describe('httpProviderError — text() throws (catch branch)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('throws ProviderError with status when text() rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorHttpResponseWithThrowingText(503)))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })
})

describe('streamCompletion — gemini path', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('streams text from valid Gemini SSE', async () => {
    const lines = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"},{"text":" World"}]}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      apiKey: 'AIza-test',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('Hello World')
  })

  it('throws ProviderError on non-ok HTTP from Gemini', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorHttpResponse(429, 'Rate limited')))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        apiKey: 'AIza-test',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('throws ProviderError on Gemini in-band error frame', async () => {
    const lines = [
      'data: {"error":{"type":"rate_limit","message":"Too many"}}',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        apiKey: 'AIza-test',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('skips candidates without text parts', async () => {
    const lines = [
      'data: {"candidates":[{"content":{"parts":null}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      apiKey: 'AIza-test',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('hi')
  })
})

describe('resolveBoardProviderFrom — unknown provider in registry', () => {
  it('returns unsupported for a non-existent provider id', () => {
    const result = resolveBoardProviderFrom({}, 'nonexistent-provider' as never, undefined)
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' })
  })
})

describe('streamCompletion — SSE buffer overflow', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('throws ProviderError when SSE buffer grows too large', async () => {
    // Stream a very large chunk without newlines to overflow the buffer
    // SSE_BUFFER_MAX_CHARS = 1_000_000
    const encoder = new TextEncoder()
    const hugeData = 'x'.repeat(1_100_000) // > 1MB, no newlines
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(hugeData))
        controller.close()
      },
    })
    const fakeResponse = {
      ok: true,
      status: 200,
      body: stream,
    } as unknown as Response

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })
})
