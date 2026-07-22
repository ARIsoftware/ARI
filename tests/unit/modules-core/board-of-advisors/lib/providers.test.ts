/**
 * Tests for board-of-advisors/lib/providers.ts
 *
 * Mocks:
 *  - @/lib/db  (withAdminDb)
 *  - @/lib/db/schema  (moduleSettings)
 *  - @/lib/crypto  (decrypt, isEncrypted)
 *  - global fetch (for streaming functions)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Module mocks (must be declared before the imports below) ───────────────

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

// drizzle-orm: the module uses eq / and — mock them as no-ops that return a value
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ eq: true })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

import { withAdminDb } from '@/lib/db'
import { decrypt, isEncrypted } from '@/lib/crypto'
import {
  readIntegrationSettings,
  resolveBoardProviderFrom,
  isProviderConfiguredIn,
  ProviderError,
  streamCompletion,
  type IntegrationSettings,
} from '@/modules-core/board-of-advisors/lib/providers'

const mockWithAdminDb = vi.mocked(withAdminDb)
const mockDecrypt = vi.mocked(decrypt)
const mockIsEncrypted = vi.mocked(isEncrypted)

// ─── readIntegrationSettings ────────────────────────────────────────────────

describe('readIntegrationSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the settings object from DB', async () => {
    const settings = { OPENAI_API_KEY: 'sk-abc' }
    mockWithAdminDb.mockImplementationOnce(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ settings }] }) }) }),
      }
      return fn(fakeDb)
    })
    const result = await readIntegrationSettings('user-1')
    expect(result).toEqual(settings)
  })

  it('returns {} when no rows found', async () => {
    mockWithAdminDb.mockImplementationOnce(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      }
      return fn(fakeDb)
    })
    const result = await readIntegrationSettings('user-1')
    expect(result).toEqual({})
  })
})

// ─── resolveBoardProviderFrom ────────────────────────────────────────────────

describe('resolveBoardProviderFrom', () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    // Restore any env var changes
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OLLAMA_BASE_URL
    delete process.env.ELEVENLABS_API_KEY
    delete process.env.OPENAI_MODEL
  })

  it('returns ok:false reason:none when provider is null', () => {
    const result = resolveBoardProviderFrom({}, null, undefined)
    expect(result).toEqual({ ok: false, reason: 'none', providerName: '' })
  })

  it('returns ok:false reason:unsupported for voice provider (elevenlabs)', () => {
    const result = resolveBoardProviderFrom({}, 'elevenlabs', undefined)
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' })
    expect((result as { providerName: string }).providerName).toBe('ElevenLabs')
  })

  it('returns ok:false reason:nokey when no key is available', () => {
    mockIsEncrypted.mockReturnValue(false)
    // No saved key, no env var
    delete process.env.OPENAI_API_KEY
    const result = resolveBoardProviderFrom({}, 'openai', undefined)
    expect(result).toMatchObject({ ok: false, reason: 'nokey' })
  })

  it('resolves from saved plaintext value in settings', () => {
    mockIsEncrypted.mockReturnValue(false)
    const saved: IntegrationSettings = { OPENAI_API_KEY: 'sk-saved' }
    const result = resolveBoardProviderFrom(saved, 'openai', undefined)
    expect(result).toMatchObject({ ok: true, apiKey: 'sk-saved', provider: 'openai' })
  })

  it('decrypts an encrypted saved value', () => {
    mockIsEncrypted.mockReturnValue(true)
    mockDecrypt.mockReturnValue('sk-decrypted')
    const saved: IntegrationSettings = { OPENAI_API_KEY: 'enc:something' }
    const result = resolveBoardProviderFrom(saved, 'openai', undefined)
    expect(result).toMatchObject({ ok: true, apiKey: 'sk-decrypted' })
  })

  it('falls back to process.env when no saved value', () => {
    mockIsEncrypted.mockReturnValue(false)
    process.env.OPENAI_API_KEY = 'sk-env'
    const result = resolveBoardProviderFrom({}, 'openai', undefined)
    expect(result).toMatchObject({ ok: true, apiKey: 'sk-env' })
  })

  it('uses model override when provided', () => {
    mockIsEncrypted.mockReturnValue(false)
    const saved: IntegrationSettings = { OPENAI_API_KEY: 'sk-saved' }
    const result = resolveBoardProviderFrom(saved, 'openai', { openai: 'gpt-4o' })
    expect(result).toMatchObject({ ok: true, modelId: 'gpt-4o' })
  })

  it('falls back to env model when no override', () => {
    mockIsEncrypted.mockReturnValue(false)
    process.env.OPENAI_API_KEY = 'sk-env'
    process.env.OPENAI_MODEL = 'gpt-4-turbo'
    const result = resolveBoardProviderFrom({}, 'openai', undefined)
    expect(result).toMatchObject({ ok: true, modelId: 'gpt-4-turbo' })
  })

  it('falls back to registry model placeholder when no env model', () => {
    mockIsEncrypted.mockReturnValue(false)
    process.env.OPENAI_API_KEY = 'sk-env'
    delete process.env.OPENAI_MODEL
    const result = resolveBoardProviderFrom({}, 'openai', undefined)
    expect(result).toMatchObject({ ok: true, modelId: 'gpt-5' }) // registry placeholder
  })

  it('ollama uses placeholder as apiKey when no saved/env value', () => {
    mockIsEncrypted.mockReturnValue(false)
    delete process.env.OLLAMA_BASE_URL
    // keyIsPlaintext=true => placeholder used as default
    const result = resolveBoardProviderFrom({}, 'ollama', undefined)
    expect(result).toMatchObject({ ok: true, apiKey: 'http://localhost:11434' })
  })

  it('trims whitespace from model override', () => {
    mockIsEncrypted.mockReturnValue(false)
    const saved: IntegrationSettings = { OPENAI_API_KEY: 'sk-saved' }
    const result = resolveBoardProviderFrom(saved, 'openai', { openai: '  gpt-4o  ' })
    expect(result).toMatchObject({ ok: true, modelId: 'gpt-4o' })
  })

  it('empty-string model override falls back to env/placeholder', () => {
    mockIsEncrypted.mockReturnValue(false)
    process.env.OPENAI_API_KEY = 'sk-env'
    process.env.OPENAI_MODEL = 'gpt-4-turbo'
    const result = resolveBoardProviderFrom({}, 'openai', { openai: '   ' })
    expect(result).toMatchObject({ ok: true, modelId: 'gpt-4-turbo' })
  })
})

// ─── isProviderConfiguredIn ──────────────────────────────────────────────────

describe('isProviderConfiguredIn', () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns false for unknown provider id', () => {
    const result = isProviderConfiguredIn({}, 'unknown-provider' as never)
    expect(result).toBe(false)
  })

  it('returns true when saved key present', () => {
    mockIsEncrypted.mockReturnValue(false)
    const result = isProviderConfiguredIn({ OPENAI_API_KEY: 'sk-abc' }, 'openai')
    expect(result).toBe(true)
  })

  it('returns true when env var present', () => {
    mockIsEncrypted.mockReturnValue(false)
    process.env.OPENAI_API_KEY = 'sk-env'
    const result = isProviderConfiguredIn({}, 'openai')
    expect(result).toBe(true)
  })

  it('returns false when neither saved nor env', () => {
    mockIsEncrypted.mockReturnValue(false)
    delete process.env.OPENAI_API_KEY
    const result = isProviderConfiguredIn({}, 'openai')
    expect(result).toBe(false)
  })
})

// ─── ProviderError ───────────────────────────────────────────────────────────

describe('ProviderError', () => {
  it('is an instance of Error', () => {
    const err = new ProviderError('oops')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name ProviderError', () => {
    const err = new ProviderError('msg')
    expect(err.name).toBe('ProviderError')
  })

  it('stores status code', () => {
    const err = new ProviderError('msg', 429)
    expect(err.status).toBe(429)
  })

  it('status is undefined when not provided', () => {
    const err = new ProviderError('msg')
    expect(err.status).toBeUndefined()
  })
})

// ─── streamCompletion ────────────────────────────────────────────────────────

describe('streamCompletion — unsupported provider', () => {
  it('throws ProviderError for unsupported provider', async () => {
    await expect(async () => {
      const gen = streamCompletion({
        provider: 'invalid-provider' as never,
        model: 'model',
        apiKey: 'key',
        system: 'sys',
        prompt: 'hi',
      })
      // Must iterate to trigger
      for await (const _ of gen) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })
})

describe('streamCompletion — ollama invalid URL', () => {
  it('throws ProviderError for non-URL base', async () => {
    await expect(async () => {
      const gen = streamCompletion({
        provider: 'ollama',
        model: 'llama3',
        apiKey: 'not-a-url',
        system: 'sys',
        prompt: 'hi',
      })
      for await (const _ of gen) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('throws ProviderError for non-http URL', async () => {
    await expect(async () => {
      const gen = streamCompletion({
        provider: 'ollama',
        model: 'llama3',
        apiKey: 'ftp://localhost:11434',
        system: 'sys',
        prompt: 'hi',
      })
      for await (const _ of gen) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })
})

// ─── streamCompletion — OpenAI compat (fetch mock) ───────────────────────────

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

describe('streamCompletion — openai (fetch mock)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('streams text deltas from valid SSE', async () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}',
      'data: {"choices":[{"delta":{"content":"world"}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))

    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('Hello world')
  })

  it('throws ProviderError on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorHttpResponse(401, 'Unauthorized')))
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

  it('throws ProviderError on in-band error frame', async () => {
    const lines = [
      'data: {"error":{"type":"rate_limit","message":"Too many requests"}}',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
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

  it('skips malformed JSON frames silently', async () => {
    const lines = [
      'data: not-json',
      'data: {"choices":[{"delta":{"content":"ok"}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('ok')
  })

  it('skips non-data lines', async () => {
    const lines = [
      ': comment line',
      'data: {"choices":[{"delta":{"content":"result"}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('result')
  })
})

describe('streamCompletion — claude (fetch mock)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('streams text_delta events from Anthropic SSE', async () => {
    const lines = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'claude',
      model: 'claude-3-5-sonnet',
      apiKey: 'sk-ant-test',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('Hi there')
  })

  it('throws on in-band error event from Anthropic', async () => {
    const lines = [
      'data: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-ant-test',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('throws ProviderError on non-ok HTTP from Anthropic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorHttpResponse(500, 'Server Error')))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-ant-test',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('skips non-text_delta event types silently', async () => {
    const lines = [
      'data: {"type":"message_start","message":{}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"yes"}}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'claude',
      model: 'claude-3-5-sonnet',
      apiKey: 'sk-ant-test',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('yes')
  })
})

describe('streamCompletion — gemini (fetch mock)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('streams text from Gemini SSE candidates', async () => {
    const lines = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Gem"},{"text":"ini"}]}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      apiKey: 'goog-key',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('Gemini')
  })

  it('throws on in-band error from Gemini', async () => {
    const lines = [
      'data: {"error":{"type":"quota_exceeded","message":"quota exceeded"}}',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        apiKey: 'goog-key',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('throws ProviderError on non-ok HTTP from Gemini', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorHttpResponse(403, 'Forbidden')))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        apiKey: 'goog-key',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('yields empty string for candidates with no parts', async () => {
    const lines = [
      'data: {"candidates":[{"content":{"parts":null}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      apiKey: 'goog-key',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('ok')
  })
})

describe('streamCompletion — ollama (fetch mock)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('streams via ollama using /v1 path', async () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"ollama-reply"}}]}',
      'data: [DONE]',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    const chunks: string[] = []
    for await (const chunk of streamCompletion({
      provider: 'ollama',
      model: 'llama3',
      apiKey: 'http://localhost:11434',
      system: 'sys',
      prompt: 'hi',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.join('')).toBe('ollama-reply')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url as string).toContain('/v1/chat/completions')
  })

  it('throws ProviderError on non-ok response (not reflecting body)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorHttpResponse(503, 'Service Unavailable')))
    await expect(async () => {
      for await (const _ of streamCompletion({
        provider: 'ollama',
        model: 'llama3',
        apiKey: 'http://localhost:11434',
        system: 'sys',
        prompt: 'hi',
      })) { /* empty */ }
    }).rejects.toThrow(ProviderError)
  })

  it('strips trailing slash from ollama base URL', async () => {
    const lines = ['data: [DONE]']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEStream(lines)))
    for await (const _ of streamCompletion({
      provider: 'ollama',
      model: 'llama3',
      apiKey: 'http://localhost:11434///',
      system: 'sys',
      prompt: 'hi',
    })) { /* empty */ }
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url as string).not.toContain('///v1')
    expect(url as string).toContain('/v1/chat/completions')
  })
})

describe('streamCompletion — SSE buffer overflow', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('throws ProviderError when SSE buffer exceeds limit', async () => {
    // Build a chunk >1MB with no newlines
    const bigChunk = 'x'.repeat(1_001_000)
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(bigChunk))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as unknown as Response))

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
