/**
 * Tests for modules-core/chat/lib/providers.ts
 *
 * Mocks:
 *  - @/lib/db      (withAdminDb → fake select chain)
 *  - @/lib/crypto  (decrypt, isEncrypted)
 *  - @/lib/storage (getStorageProvider, readStorageConfig, sanitize helpers)
 *  - global fetch  (SSE bodies built as ReadableStream<Uint8Array>)
 *
 * @/lib/constants and @/lib/ai-providers stay real (pure definitions).
 * @/lib/db/schema must be mocked: the real barrel re-exports untracked
 * modules-custom schemas the vitest alias cannot resolve. drizzle-orm's
 * eq/and are mocked alongside so they accept the fake column objects.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Module mocks (must be declared before the imports below) ───────────────

vi.mock('@/lib/db', () => ({
  withAdminDb: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ eq: true })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn(),
  isEncrypted: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  getStorageProvider: vi.fn(),
  readStorageConfig: vi.fn(() => ({ provider: 'filesystem' })),
  sanitizeBucketName: vi.fn((b: string) => b),
  validateStoredFilename: vi.fn((f: string) => f),
}))

import { withAdminDb } from '@/lib/db'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { getStorageProvider, sanitizeBucketName, validateStoredFilename } from '@/lib/storage'
import type { StorageProvider } from '@/lib/storage'
import {
  getProviderApiKey,
  getProviderConfiguredModel,
  listProviderAvailability,
  resolveImageConfig,
  expandAttachments,
  streamChat,
  type StreamChatOptions,
} from '@/modules-core/chat/lib/providers'
import { CHAT_PROVIDER_IDS } from '@/modules-core/chat/lib/utils'
import { AI_PROVIDERS } from '@/lib/ai-providers'
import type { ChatAttachment, ChatMessage, ChatRole } from '@/modules-core/chat/types'

const mockWithAdminDb = vi.mocked(withAdminDb)
const mockDecrypt = vi.mocked(decrypt)
const mockIsEncrypted = vi.mocked(isEncrypted)
const mockGetStorageProvider = vi.mocked(getStorageProvider)
const mockSanitizeBucketName = vi.mocked(sanitizeBucketName)
const mockValidateStoredFilename = vi.mocked(validateStoredFilename)

// ─── Helpers ─────────────────────────────────────────────────────────────────

// All env keys the chat providers can read — blanked per-test for determinism.
const ENV_KEYS = AI_PROVIDERS.flatMap((p) => [p.primaryEnvKey, p.modelEnvKey])

function primeSettings(rows: Array<{ settings: unknown }>) {
  mockWithAdminDb.mockImplementation(async (fn: (db: never) => Promise<unknown>) => {
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    }
    return fn(fakeDb as never)
  })
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function serveResult(data: string) {
  const buf = Buffer.from(data)
  return { stream: streamOf(new Uint8Array(buf)), contentType: 'application/octet-stream', size: buf.length }
}

const mockServe = vi.fn()

// SSE response whose body is built from the given raw string chunks.
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return {
    ok: true,
    status: 200,
    body: streamOf(...chunks.map((c) => encoder.encode(c))),
  } as unknown as Response
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = []
  for await (const piece of gen) out.push(piece)
  return out
}

async function collectErr(gen: AsyncGenerator<string>): Promise<Error> {
  try {
    for await (const _ of gen) { /* drain */ }
  } catch (e) {
    return e as Error
  }
  throw new Error('expected generator to throw')
}

const UUID = '123e4567-e89b-12d3-a456-426614174000'

function att(overrides: Partial<ChatAttachment>): ChatAttachment {
  return {
    upload_id: UUID,
    filename: 'img.png',
    original_name: 'diagram.png',
    mime: 'image/png',
    size: 3,
    bucket: 'chat',
    ...overrides,
  }
}

const IMG_ATT = att({})
const TXT_ATT = att({ filename: 'notes.txt', original_name: 'notes`.txt', mime: 'text/plain' })
const JSON_ATT = att({ filename: 'data.json', original_name: 'data.json', mime: 'application/json' })
const GONE_ATT = att({ filename: 'gone.txt', original_name: 'gone.txt', mime: 'text/plain' })
const PDF_ATT = att({ filename: 'doc.pdf', original_name: 'doc.pdf', mime: 'application/pdf' })

// 'IMG' → base64
const IMG_B64 = 'SU1H'
const TXT_FENCE = "\n\n[Attachment: notes'.txt]\n```\nhello text\n```"
const GONE_NOTE = '\n\n[Attachment "gone.txt" is unavailable.]'

let msgSeq = 0
function msg(role: ChatRole, content: string, attachments: ChatAttachment[] = []): ChatMessage {
  return {
    id: `00000000-0000-0000-0000-${String(++msgSeq).padStart(12, '0')}`,
    conversation_id: UUID,
    user_id: 'u1',
    role,
    content,
    attachments,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function opts(overrides: Partial<StreamChatOptions> & Pick<StreamChatOptions, 'provider'>): StreamChatOptions {
  return { userId: 'u1', model: 'test-model', history: [], apiKey: 'sk-key', ...overrides }
}

function fetchBody(fetchMock: ReturnType<typeof vi.fn>, callIdx = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIdx][1] as RequestInit
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of ENV_KEYS) vi.stubEnv(key, '')
  mockIsEncrypted.mockReturnValue(false)
  mockValidateStoredFilename.mockImplementation((f: string) => f)
  mockSanitizeBucketName.mockImplementation((b: string) => b)
  mockGetStorageProvider.mockReturnValue({ serve: mockServe } as unknown as StorageProvider)
  mockServe.mockImplementation(async (_userId: string, _bucket: string, filename: string) => {
    if (filename === 'img.png') return serveResult('IMG')
    if (filename === 'notes.txt') return serveResult('hello text')
    if (filename === 'data.json') return serveResult('{"a":1}')
    if (filename === 'doc.pdf') return serveResult('%PDF')
    return null
  })
  primeSettings([])
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ─── getProviderApiKey ───────────────────────────────────────────────────────

describe('getProviderApiKey', () => {
  it('returns a saved plaintext key', async () => {
    primeSettings([{ settings: { OPENAI_API_KEY: 'sk-plain' } }])
    await expect(getProviderApiKey('u1', 'openai')).resolves.toBe('sk-plain')
    expect(mockDecrypt).not.toHaveBeenCalled()
  })

  it('decrypts a saved encrypted key', async () => {
    primeSettings([{ settings: { OPENAI_API_KEY: 'enc:v1' } }])
    mockIsEncrypted.mockReturnValue(true)
    mockDecrypt.mockReturnValue('sk-decrypted')
    await expect(getProviderApiKey('u1', 'openai')).resolves.toBe('sk-decrypted')
    expect(mockDecrypt).toHaveBeenCalledWith('enc:v1')
  })

  it('falls back to the env var when nothing is saved (anthropic → ANTHROPIC_API_KEY)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-env')
    await expect(getProviderApiKey('u1', 'anthropic')).resolves.toBe('sk-env')
  })

  it('returns null when neither saved nor env is set', async () => {
    primeSettings([{ settings: null }]) // covers the `?? {}` settings fallback
    await expect(getProviderApiKey('u1', 'openai')).resolves.toBeNull()
  })

  it('ignores a non-string saved value and uses the env var', async () => {
    primeSettings([{ settings: { OPENAI_API_KEY: 42 } }])
    vi.stubEnv('OPENAI_API_KEY', 'sk-env2')
    await expect(getProviderApiKey('u1', 'openai')).resolves.toBe('sk-env2')
  })
})

// ─── getProviderConfiguredModel ──────────────────────────────────────────────

describe('getProviderConfiguredModel', () => {
  it('prefers the saved model', async () => {
    primeSettings([{ settings: { OPENAI_MODEL: 'gpt-custom' } }])
    vi.stubEnv('OPENAI_MODEL', 'gpt-env')
    await expect(getProviderConfiguredModel('u1', 'openai')).resolves.toBe('gpt-custom')
  })

  it('falls back to the env model when nothing saved (gemini → GOOGLE_GEMINI_MODEL)', async () => {
    vi.stubEnv('GOOGLE_GEMINI_MODEL', 'gem-env')
    await expect(getProviderConfiguredModel('u1', 'gemini')).resolves.toBe('gem-env')
  })

  it('falls back to the registry placeholder when nothing is configured', async () => {
    await expect(getProviderConfiguredModel('u1', 'openrouter')).resolves.toBe('openrouter/auto')
  })

  it('treats an empty saved model as unset', async () => {
    primeSettings([{ settings: { OPENAI_MODEL: '' } }])
    await expect(getProviderConfiguredModel('u1', 'openai')).resolves.toBe('gpt-5')
  })
})

// ─── listProviderAvailability ────────────────────────────────────────────────

describe('listProviderAvailability', () => {
  it('reports every registry chat provider with saved/env/absent configuration', async () => {
    primeSettings([{ settings: { OPENAI_API_KEY: 'sk-o', OPENAI_MODEL: 'gpt-saved', COHERE_API_KEY: 'co' } }])
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-a-env')
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-env')

    const list = await listProviderAvailability('u1')
    expect(list.map((a) => a.provider)).toEqual(CHAT_PROVIDER_IDS)
    expect(list.map((a) => a.provider)).not.toContain('elevenlabs')
    const by = (id: string) => list.find((a) => a.provider === id)
    expect(by('openai')).toEqual({ provider: 'openai', configured: true, configuredModel: 'gpt-saved', defaultModel: 'gpt-5' })
    expect(by('anthropic')).toEqual({ provider: 'anthropic', configured: true, configuredModel: 'claude-env', defaultModel: 'claude-sonnet-4-5' })
    expect(by('gemini')).toEqual({ provider: 'gemini', configured: false, configuredModel: null, defaultModel: 'gemini-2.5-flash' })
    expect(by('cohere')).toMatchObject({ configured: true, defaultModel: 'command-a-03-2025' })
  })

  it('ignores non-string saved models', async () => {
    primeSettings([{ settings: { OPENAI_API_KEY: 'sk-o', OPENAI_MODEL: 123 } }])
    const list = await listProviderAvailability('u1')
    expect(list.find((a) => a.provider === 'openai')).toMatchObject({ configured: true, configuredModel: null })
  })
})

// ─── expandAttachments ───────────────────────────────────────────────────────

describe('expandAttachments', () => {
  it('expands an image into a base64 image kind', async () => {
    const out = await expandAttachments('u1', [IMG_ATT])
    expect(out).toEqual([{ kind: 'image', attachment: IMG_ATT, base64: IMG_B64 }])
    expect(mockServe).toHaveBeenCalledWith('u1', 'chat', 'img.png')
  })

  it('expands text/plain and application/json into utf8 text kinds', async () => {
    const out = await expandAttachments('u1', [TXT_ATT, JSON_ATT])
    expect(out).toEqual([
      { kind: 'text', attachment: TXT_ATT, text: 'hello text' },
      { kind: 'text', attachment: JSON_ATT, text: '{"a":1}' },
    ])
  })

  it('filters out unsupported mimes entirely', async () => {
    const out = await expandAttachments('u1', [PDF_ATT])
    expect(out).toEqual([])
  })

  it('flags a missing file (storage.serve → null)', async () => {
    const out = await expandAttachments('u1', [GONE_ATT])
    expect(out).toEqual([{ kind: 'text', attachment: GONE_ATT, missing: true }])
  })

  it('flags missing when the download throws', async () => {
    mockServe.mockRejectedValueOnce(new Error('io error'))
    const out = await expandAttachments('u1', [IMG_ATT])
    expect(out).toEqual([{ kind: 'text', attachment: IMG_ATT, missing: true }])
  })

  it('flags missing when the stored filename is invalid (never touches storage)', async () => {
    mockValidateStoredFilename.mockReturnValueOnce(null)
    const out = await expandAttachments('u1', [IMG_ATT])
    expect(out).toEqual([{ kind: 'text', attachment: IMG_ATT, missing: true }])
    expect(mockServe).not.toHaveBeenCalled()
  })

  it('flags missing when sanitizeBucketName throws', async () => {
    mockSanitizeBucketName.mockImplementationOnce(() => {
      throw new Error('bad bucket')
    })
    const out = await expandAttachments('u1', [IMG_ATT])
    expect(out).toEqual([{ kind: 'text', attachment: IMG_ATT, missing: true }])
    expect(mockServe).not.toHaveBeenCalled()
  })

  it('flags missing when the sanitized bucket differs from the stored one', async () => {
    mockSanitizeBucketName.mockReturnValueOnce('other')
    const out = await expandAttachments('u1', [IMG_ATT])
    expect(out).toEqual([{ kind: 'text', attachment: IMG_ATT, missing: true }])
    expect(mockServe).not.toHaveBeenCalled()
  })

  it('concatenates multi-chunk streams and skips empty read values', async () => {
    mockServe.mockResolvedValueOnce({
      stream: streamOf(
        new Uint8Array(Buffer.from('he')),
        undefined as unknown as Uint8Array, // read() yields an empty value — must be skipped
        new Uint8Array(Buffer.from('llo'))
      ),
      contentType: 'text/plain',
      size: 5,
    })
    const out = await expandAttachments('u1', [TXT_ATT])
    expect(out).toEqual([{ kind: 'text', attachment: TXT_ATT, text: 'hello' }])
  })
})

// ─── streamChat — OpenAI ─────────────────────────────────────────────────────

describe('streamChat — openai', () => {
  it('builds the payload (system passthrough, data URIs, fenced text, missing note) and yields deltas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n',
        '\n: keep-alive\nevent: ping\n', // blank + non-data lines are skipped
        'data:\n', // empty data payload is skipped
        'data: notjson\n', // malformed JSON is ignored
        'data: {"choices":[{"delta":{}}]}\n', // empty piece is filtered
        'data: {"choices":[{"delta":{"content":" world"}}]}', // no trailing newline → flush path
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const history = [
      msg('system', 'You are helpful'),
      msg('user', 'plain question'),
      msg('assistant', 'previous answer'),
      msg('user', 'with files', [IMG_ATT, TXT_ATT, GONE_ATT]),
    ]
    const deltas = await collect(streamChat(opts({ provider: 'openai', history, model: 'gpt-5' })))
    expect(deltas).toEqual(['Hel', 'lo', ' world'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-key')

    const body = fetchBody(fetchMock)
    expect(body.model).toBe('gpt-5')
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'plain question' },
      { role: 'assistant', content: 'previous answer' },
      {
        role: 'user',
        content: [
          { type: 'text', text: `with files${TXT_FENCE}${GONE_NOTE}` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${IMG_B64}` } },
        ],
      },
    ])
  })

  it('stops at a mid-stream [DONE] terminator', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(['data: {"choices":[{"delta":{"content":"A"}}]}\ndata: [DONE]\ndata: {"choices":[{"delta":{"content":"B"}}]}\n'])
    )
    vi.stubGlobal('fetch', fetchMock)
    const deltas = await collect(streamChat(opts({ provider: 'openai', history: [msg('user', 'hi')] })))
    expect(deltas).toEqual(['A'])
  })

  it('handles a [DONE] terminator in the final flush (no trailing newline)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(['data: {"choices":[{"delta":{"content":"A"}}]}\ndata: [DONE]'])
    )
    vi.stubGlobal('fetch', fetchMock)
    const deltas = await collect(streamChat(opts({ provider: 'openai', history: [msg('user', 'hi')] })))
    expect(deltas).toEqual(['A'])
  })

  it('throws the status + truncated body on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
      text: async () => 'x'.repeat(600),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const err = await collectErr(streamChat(opts({ provider: 'openai' })))
    expect(err.message).toBe(`Provider request failed (401): ${'x'.repeat(500)}`)
  })

  it('falls back to a bare status message when res.text() rejects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
      text: async () => {
        throw new Error('unreadable')
      },
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const err = await collectErr(streamChat(opts({ provider: 'openai' })))
    expect(err.message).toBe('Provider request failed (500)')
  })

  it('throws when the response is ok but has no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      text: async () => 'empty body',
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const err = await collectErr(streamChat(opts({ provider: 'openai' })))
    expect(err.message).toBe('Provider request failed (200): empty body')
  })
})

// ─── streamChat — OpenRouter ─────────────────────────────────────────────────

describe('streamChat — openrouter', () => {
  it('uses the openrouter.ai base URL and reassembles lines split across chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(['data: {"choices":[{"delta":{"con', 'tent":"XY"}}]}\n'])
    )
    vi.stubGlobal('fetch', fetchMock)

    // Attachments left undefined (legacy rows) must be treated like none.
    const legacy = { ...msg('user', 'hi'), attachments: undefined as unknown as ChatAttachment[] }
    const deltas = await collect(streamChat(opts({ provider: 'openrouter', history: [legacy] })))
    expect(deltas).toEqual(['XY'])

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(fetchBody(fetchMock).messages).toEqual([{ role: 'user', content: 'hi' }])
  })
})

// ─── streamChat — other OpenAI-compatible providers ──────────────────────────

describe('streamChat — OpenAI-compatible registry providers', () => {
  it.each([
    ['cohere', 'https://api.cohere.ai/compatibility/v1/chat/completions'],
    ['xai', 'https://api.x.ai/v1/chat/completions'],
    ['mistral', 'https://api.mistral.ai/v1/chat/completions'],
    ['deepseek', 'https://api.deepseek.com/v1/chat/completions'],
    ['groq', 'https://api.groq.com/openai/v1/chat/completions'],
    ['perplexity', 'https://api.perplexity.ai/chat/completions'],
  ] as const)('%s streams from its base URL with bearer auth', async (provider, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n']))
    vi.stubGlobal('fetch', fetchMock)
    const deltas = await collect(streamChat(opts({ provider, history: [msg('user', 'hi')] })))
    expect(deltas).toEqual(['ok'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(expectedUrl)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-key')
  })

  it('normalizes history to one leading system message and alternating turns', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n']))
    vi.stubGlobal('fetch', fetchMock)
    const history = [
      msg('assistant', 'orphan'),
      msg('system', 'sys A'),
      msg('user', 'q1'),
      msg('user', 'q1 again'),
      msg('assistant', 'a1'),
      msg('system', 'sys B'),
      msg('user', 'q2'),
    ]
    await collect(streamChat(opts({ provider: 'perplexity', history })))
    expect(fetchBody(fetchMock).messages).toEqual([
      { role: 'system', content: 'sys A\n\nsys B' },
      { role: 'user', content: 'q1\n\nq1 again' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ])
  })

  it('omits the system message when the history has none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n']))
    vi.stubGlobal('fetch', fetchMock)
    await collect(streamChat(opts({ provider: 'mistral', history: [msg('user', 'hi')] })))
    expect(fetchBody(fetchMock).messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('throws for a provider Chat has no adapter for', async () => {
    const err = await collectErr(streamChat(opts({ provider: 'elevenlabs' as never })))
    expect(err.message).toBe('elevenlabs is not supported by Chat. Pick another provider.')
  })
})

// ─── streamChat — Ollama ─────────────────────────────────────────────────────

describe('streamChat — ollama', () => {
  it('streams from <base>/v1 without an Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"local"}}]}\n']))
    vi.stubGlobal('fetch', fetchMock)
    const deltas = await collect(
      streamChat(opts({ provider: 'ollama', apiKey: ' http://localhost:11434/ ', history: [msg('user', 'hi')] }))
    )
    expect(deltas).toEqual(['local'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('never reflects the endpoint error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
      text: async () => 'internal secret page',
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const err = await collectErr(streamChat(opts({ provider: 'ollama', apiKey: 'http://10.0.0.5:8080' })))
    expect(err.message).toBe('Provider request failed (404)')
  })

  it('rejects a base URL that is not a URL', async () => {
    const err = await collectErr(streamChat(opts({ provider: 'ollama', apiKey: 'not a url' })))
    expect(err.message).toMatch(/not a valid URL/)
  })

  it('rejects a non-http(s) base URL', async () => {
    const err = await collectErr(streamChat(opts({ provider: 'ollama', apiKey: 'file:///etc/passwd' })))
    expect(err.message).toMatch(/must start with http/)
  })
})

// ─── streamChat — Anthropic ──────────────────────────────────────────────────

describe('streamChat — anthropic', () => {
  it('extracts system blocks, normalizes turns, builds image blocks, and yields text deltas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"type":"message_start","message":{}}\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n',
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{}"}}\n',
        'data: {"type":"content_block_delta"}\n', // no delta at all
        'data: {"type":"content_block_delta","delta":{"type":"text_delta"}}\n', // text ?? ''
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n',
        'data: [DONE]\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const history = [
      msg('system', 'sys1'),
      msg('assistant', 'leading assistant reply'), // dropped: history must start with a user turn
      msg('system', 'sys2'),
      msg('user', 'u1', [TXT_ATT]),
      msg('user', 'u2', [IMG_ATT]), // coalesced into the previous user turn
      msg('assistant', 'a1'),
      msg('assistant', 'a2'), // coalesced into the previous assistant turn
      msg('user', 'u3'),
    ]
    const deltas = await collect(streamChat(opts({ provider: 'anthropic', history, model: 'claude-x' })))
    expect(deltas).toEqual(['Hi ', 'there'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-key')
    expect(headers['anthropic-version']).toBe('2023-06-01')

    const body = fetchBody(fetchMock)
    expect(body.model).toBe('claude-x')
    expect(body.max_tokens).toBe(4096)
    expect(body.stream).toBe(true)
    expect(body.system).toBe('sys1\n\nsys2')
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: `u1\n\nu2${TXT_FENCE}` },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMG_B64 } },
        ],
      },
      { role: 'assistant', content: 'a1\n\na2' },
      { role: 'user', content: 'u3' },
    ])
  })

  it('omits the system field when there are no system messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n']))
    vi.stubGlobal('fetch', fetchMock)
    await collect(streamChat(opts({ provider: 'anthropic', history: [msg('user', 'hi')] })))
    expect('system' in fetchBody(fetchMock)).toBe(false)
  })

  it('throws on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 529,
      body: null,
      text: async () => 'Overloaded',
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const err = await collectErr(streamChat(opts({ provider: 'anthropic', history: [msg('user', 'hi')] })))
    expect(err.message).toBe('Provider request failed (529): Overloaded')
  })
})

// ─── streamChat — Gemini ─────────────────────────────────────────────────────

describe('streamChat — gemini', () => {
  it('maps roles to user/model, inlines images, and encodes model + key into the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Ge"},{"text":"m"}]}}]}\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"i"},{}]}}]}\n', // part without text
        'data: {"candidates":[{"content":{}}]}\n', // parts not an array → ''
        'data: {"candidates":[]}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const history = [
      msg('system', 'be brief'),
      msg('user', 'q1', [IMG_ATT, TXT_ATT, GONE_ATT]),
      msg('assistant', 'a1'),
      msg('user', 'q2'),
    ]
    const deltas = await collect(
      streamChat(opts({ provider: 'gemini', history, model: 'gemini 2.5/flash', apiKey: 'k&y' }))
    )
    expect(deltas).toEqual(['Gem', 'i'])

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini%202.5%2Fflash:streamGenerateContent?alt=sse&key=k%26y'
    )

    const body = fetchBody(fetchMock)
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'be brief' }] })
    expect(body.contents).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'q1' },
          { inlineData: { mimeType: 'image/png', data: IMG_B64 } },
          { text: TXT_FENCE },
          { text: GONE_NOTE },
        ],
      },
      { role: 'model', parts: [{ text: 'a1' }] },
      { role: 'user', parts: [{ text: 'q2' }] },
    ])
  })

  it('omits systemInstruction and drops an assistant-only history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const deltas = await collect(streamChat(opts({ provider: 'gemini', history: [msg('assistant', 'orphan')] })))
    expect(deltas).toEqual([])
    const body = fetchBody(fetchMock)
    expect(body.contents).toEqual([])
    expect('systemInstruction' in body).toBe(false)
  })

  it('throws on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      body: null,
      text: async () => 'Forbidden',
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const err = await collectErr(streamChat(opts({ provider: 'gemini', history: [msg('user', 'hi')] })))
    expect(err.message).toBe('Provider request failed (403): Forbidden')
  })
})

// ─── Image tool ──────────────────────────────────────────────────────────────

/** Drain a streamChat generator, returning its text and its tool calls. */
async function run(gen: AsyncGenerator<string, unknown>) {
  const text: string[] = []
  let r = await gen.next()
  while (!r.done) {
    text.push(r.value)
    r = await gen.next()
  }
  return { text, calls: r.value }
}

const IMG_ATT_ON_REPLY = att({ original_name: 'a red fox' })

describe('streamChat — image tool (OpenAI-compatible)', () => {
  it('offers the tool and assembles streamed tool-call fragments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Drawing it."}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"generate_image","arguments":"{\\"pro"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"mpt\\":\\"a fox\\"}"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"other","arguments":"not json"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":5,"function":{"arguments":"{}"}}]}}]}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)
    const { text, calls } = await run(
      streamChat(opts({ provider: 'openai', imageTool: true, history: [msg('user', 'draw a fox')] }))
    )
    expect(text).toEqual(['Drawing it.'])
    expect(calls).toEqual([
      { name: 'generate_image', args: { prompt: 'a fox' } },
      { name: 'other', args: {} },
    ])
    const tools = fetchBody(fetchMock).tools as Array<{ function: { name: string } }>
    expect(tools.map((t) => t.function.name)).toEqual(['generate_image'])
  })

  it('treats non-object tool arguments as empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(['data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"generate_image","arguments":"[1]"}}]}}]}\n'])
    )
    vi.stubGlobal('fetch', fetchMock)
    const { calls } = await run(streamChat(opts({ provider: 'groq', imageTool: true, history: [msg('user', 'x')] })))
    expect(calls).toEqual([{ name: 'generate_image', args: {} }])
  })

  it('sends no tools when the tool is off, and never to Perplexity', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n']))
    vi.stubGlobal('fetch', fetchMock)
    await run(streamChat(opts({ provider: 'openai', history: [msg('user', 'x')] })))
    await run(streamChat(opts({ provider: 'perplexity', imageTool: true, history: [msg('user', 'x')] })))
    expect(fetchBody(fetchMock, 0)).not.toHaveProperty('tools')
    expect(fetchBody(fetchMock, 1)).not.toHaveProperty('tools')
  })

  it('retries without tools when the model rejects them', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, body: null, text: async () => 'No endpoints found that support tool use' } as unknown as Response)
      .mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"plain"}}]}\n']))
    vi.stubGlobal('fetch', fetchMock)
    const { text, calls } = await run(
      streamChat(opts({ provider: 'openrouter', imageTool: true, history: [msg('user', 'x')] }))
    )
    expect(text).toEqual(['plain'])
    expect(calls).toEqual([])
    expect(fetchBody(fetchMock, 0)).toHaveProperty('tools')
    expect(fetchBody(fetchMock, 1)).not.toHaveProperty('tools')
  })

  it('reports the retry failure (hiding the body for Ollama)', async () => {
    const toolErr = { ok: false, status: 400, body: null, text: async () => 'model does not support tools' } as unknown as Response
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolErr)
      .mockResolvedValueOnce({ ok: false, status: 500, body: null, text: async () => 'internal' } as unknown as Response)
      .mockResolvedValueOnce(toolErr)
      .mockResolvedValueOnce({ ok: false, status: 502, body: null, text: async () => 'secret' } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const a = await collectErr(streamChat(opts({ provider: 'openai', imageTool: true })))
    expect(a.message).toBe('Provider request failed (500): internal')
    const b = await collectErr(streamChat(opts({ provider: 'ollama', apiKey: 'http://localhost:11434', imageTool: true })))
    expect(b.message).toBe('Provider request failed (502)')
  })

  it('does not retry an unrelated client error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, body: null, text: async () => 'bad key' } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const err = await collectErr(streamChat(opts({ provider: 'openai', imageTool: true })))
    expect(err.message).toBe('Provider request failed (401): bad key')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a tool-sounding error when the tool was not offered', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, body: null, text: async () => 'tool' } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    await collectErr(streamChat(opts({ provider: 'openai' })))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('replays a past generated image to the model as a note', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n']))
    vi.stubGlobal('fetch', fetchMock)
    const history = [
      msg('user', 'draw a fox'),
      msg('assistant', '', [IMG_ATT_ON_REPLY, TXT_ATT]),
      msg('user', 'make it blue'),
    ]
    await run(streamChat(opts({ provider: 'openai', history })))
    expect((fetchBody(fetchMock).messages as unknown[])[1]).toEqual({
      role: 'assistant',
      content: '[Generated image: a red fox]',
    })
  })
})

describe('streamChat — image tool (Anthropic)', () => {
  it('offers the tool and collects tool_use input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"On it."}}\n',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"generate_image"}}\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"prompt\\":"}}\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"a fox\\"}"}}\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta"}}\n',
        'data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"t2"}}\n',
        'data: {"type":"content_block_delta","index":9,"delta":{"type":"input_json_delta","partial_json":"x"}}\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta"}}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)
    const history = [msg('user', 'first'), msg('assistant', 'done', [IMG_ATT_ON_REPLY]), msg('user', 'draw')]
    const { text, calls } = await run(streamChat(opts({ provider: 'anthropic', imageTool: true, history })))
    expect(text).toEqual(['On it.'])
    expect(calls).toEqual([{ name: 'generate_image', args: { prompt: 'a fox' } }])
    const body = fetchBody(fetchMock)
    expect((body.tools as Array<{ name: string }>)[0].name).toBe('generate_image')
    expect((body.messages as unknown[])[1]).toEqual({ role: 'assistant', content: 'done\n\n[Generated image: a red fox]' })
  })
})

describe('streamChat — image tool (Gemini)', () => {
  it('offers function declarations and collects functionCall parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Sure. "},{"functionCall":{"name":"generate_image","args":{"prompt":"a fox"}}}]}}]}\n',
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"generate_image","args":[1]}},{"functionCall":{}}]}}]}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)
    const history = [msg('user', 'a'), msg('assistant', '', [IMG_ATT_ON_REPLY]), msg('user', 'b')]
    const { text, calls } = await run(streamChat(opts({ provider: 'gemini', imageTool: true, history })))
    expect(text).toEqual(['Sure. '])
    expect(calls).toEqual([
      { name: 'generate_image', args: { prompt: 'a fox' } },
      { name: 'generate_image', args: {} },
    ])
    const body = fetchBody(fetchMock)
    expect(body.tools).toEqual([
      { functionDeclarations: [expect.objectContaining({ name: 'generate_image' })] },
    ])
    expect((body.contents as unknown[])[1]).toEqual({ role: 'model', parts: [{ text: '[Generated image: a red fox]' }] })
  })
})

// ─── resolveImageConfig ──────────────────────────────────────────────────────

describe('resolveImageConfig', () => {
  it("uses the chat's own provider when it can make images", async () => {
    primeSettings([{ settings: { XAI_API_KEY: 'x-key', OPENAI_API_KEY: 'o-key' } }])
    await expect(resolveImageConfig('u1', 'xai')).resolves.toEqual({ provider: 'xai', apiKey: 'x-key', model: 'grok-2-image' })
  })

  it('falls back to the first configured image provider', async () => {
    primeSettings([{ settings: { ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'or-key' } }])
    await expect(resolveImageConfig('u1', 'anthropic')).resolves.toEqual({
      provider: 'openrouter',
      apiKey: 'or-key',
      model: 'google/gemini-2.5-flash-image',
    })
  })

  it('returns null when no image provider has a key', async () => {
    primeSettings([{ settings: { ANTHROPIC_API_KEY: 'a' } }])
    await expect(resolveImageConfig('u1', 'anthropic')).resolves.toBeNull()
  })
})
