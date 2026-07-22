/**
 * Tests for lib/ai-provider-models.ts
 *
 * Covers: getProviderModels(), fetchModels() (all provider branches),
 * resolveSecret(), dedupe(), chatFirst(), cache behavior.
 *
 * Dependencies mocked:
 *  - @/lib/db (withAdminDb)
 *  - @/lib/db/schema (moduleSettings)
 *  - drizzle-orm (and/eq)
 *  - @/lib/crypto (decrypt, isEncrypted)
 *  - fetch (global)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── shared mock state ──────────────────────────────────────────────────────────

let mockWithAdminDb: ReturnType<typeof vi.fn>
let mockFetch: ReturnType<typeof vi.fn>
let mockDecrypt: ReturnType<typeof vi.fn>
let mockIsEncrypted: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  mockWithAdminDb = vi.fn().mockResolvedValue([])
  mockFetch = vi.fn()
  mockDecrypt = vi.fn((v: string) => v + '-decrypted')
  mockIsEncrypted = vi.fn().mockReturnValue(false)
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── module loader ──────────────────────────────────────────────────────────────

async function loadModule(savedSettings: Record<string, unknown> = {}) {
  // mockWithAdminDb returns the settings row
  if (Object.keys(savedSettings).length > 0) {
    mockWithAdminDb.mockResolvedValue([{ settings: savedSettings }])
  } else {
    mockWithAdminDb.mockResolvedValue([])
  }

  vi.doMock('@/lib/db', () => ({ withAdminDb: mockWithAdminDb }))
  vi.doMock('@/lib/db/schema', () => ({
    moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
  }))
  vi.doMock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  }))
  vi.doMock('@/lib/crypto', () => ({
    decrypt: mockDecrypt,
    isEncrypted: mockIsEncrypted,
  }))
  vi.doMock('@/lib/constants', () => ({
    INTEGRATIONS_MODULE_ID: 'integrations',
  }))

  return await import('@/lib/ai-provider-models')
}

// ── helper to build a successful fetch response ────────────────────────────────

function makeOkFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  })
}

function makeErrorFetch(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  })
}

// ── getProviderModels — unknown provider ───────────────────────────────────────

describe('getProviderModels — unknown provider', () => {
  it('returns unavailable for an unknown providerId', async () => {
    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'unknown-provider' as any)
    expect(result).toEqual({ models: [], source: 'unavailable' })
  })
})

// ── getProviderModels — cache ──────────────────────────────────────────────────

describe('getProviderModels — caching', () => {
  it('returns cached result on second call (same provider)', async () => {
    mockFetch = makeOkFetch({ data: [{ id: 'gpt-4' }] })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule({ OPENAI_API_KEY: 'sk-test' })
    process.env.OPENAI_API_KEY = 'sk-test'

    // First call fetches
    const r1 = await getProviderModels('user1', 'openai')
    expect(r1.source).toBe('live')

    // Second call should use cache (fetch called only once)
    const r2 = await getProviderModels('user1', 'openai')
    expect(r2.source).toBe('live')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    delete process.env.OPENAI_API_KEY
  })
})

// ── getProviderModels — OpenAI compatible (openai, xai, mistral, etc.) ────────

describe('getProviderModels — openai (OpenAI-compatible)', () => {
  it('returns models for openai with API key from env', async () => {
    mockFetch = makeOkFetch({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4' }] })
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'sk-env-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'openai')

    expect(result.source).toBe('live')
    expect(result.models.map(m => m.id)).toContain('gpt-4o')
    delete process.env.OPENAI_API_KEY
  })

  it('returns models for openai with API key from saved settings', async () => {
    mockFetch = makeOkFetch({ data: [{ id: 'gpt-4' }] })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule({ OPENAI_API_KEY: 'sk-saved' })
    const result = await getProviderModels('user1', 'openai')

    expect(result.source).toBe('live')
    expect(result.models.length).toBeGreaterThan(0)
  })

  it('returns unavailable when no API key for openai', async () => {
    mockFetch = makeOkFetch({ data: [{ id: 'gpt-4' }] })
    vi.stubGlobal('fetch', mockFetch)
    delete process.env.OPENAI_API_KEY

    const { getProviderModels } = await loadModule()
    // No key → fetchModels throws → unavailable
    const result = await getProviderModels('user1', 'openai')
    expect(result.source).toBe('unavailable')
  })

  it('returns unavailable when fetch returns non-ok response', async () => {
    mockFetch = makeErrorFetch(401)
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'bad-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'openai')
    expect(result.source).toBe('unavailable')
    delete process.env.OPENAI_API_KEY
  })

  it('deduplicates models with same id', async () => {
    mockFetch = makeOkFetch({ data: [{ id: 'gpt-4' }, { id: 'gpt-4' }, { id: 'gpt-3.5' }] })
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'sk-test'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user2', 'openai')
    const ids = result.models.map(m => m.id)
    const uniqueIds = [...new Set(ids)]
    expect(ids.length).toBe(uniqueIds.length)
    delete process.env.OPENAI_API_KEY
  })

  it('demotes embedding/audio models to bottom (chatFirst)', async () => {
    mockFetch = makeOkFetch({
      data: [
        { id: 'text-embedding-ada-002' }, // non-chat
        { id: 'gpt-4' },                  // chat
        { id: 'whisper-1' },              // non-chat
      ],
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'sk-test'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user3', 'openai')
    const ids = result.models.map(m => m.id)
    expect(ids.indexOf('gpt-4')).toBeLessThan(ids.indexOf('text-embedding-ada-002'))
    delete process.env.OPENAI_API_KEY
  })
})

// ── getProviderModels — xai ────────────────────────────────────────────────────

describe('getProviderModels — xai', () => {
  it('returns models for xai provider', async () => {
    mockFetch = makeOkFetch({ data: [{ id: 'grok-4' }] })
    vi.stubGlobal('fetch', mockFetch)
    process.env.XAI_API_KEY = 'xai-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'xai')
    expect(result.source).toBe('live')
    delete process.env.XAI_API_KEY
  })
})

// ── getProviderModels — claude (Anthropic paginated) ──────────────────────────

describe('getProviderModels — claude', () => {
  it('returns models for claude with a single page', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'claude-opus-4', display_name: 'Claude Opus 4' }],
        has_more: false,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ANTHROPIC_API_KEY = 'ant-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'claude')

    expect(result.source).toBe('live')
    expect(result.models[0].id).toBe('claude-opus-4')
    expect(result.models[0].label).toBe('Claude Opus 4')
    delete process.env.ANTHROPIC_API_KEY
  })

  it('paginates through multiple pages', async () => {
    mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'claude-1', display_name: 'Claude 1' }],
          has_more: true,
          last_id: 'claude-1',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'claude-2', display_name: 'Claude 2' }],
          has_more: false,
        }),
      })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ANTHROPIC_API_KEY = 'ant-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user2', 'claude')

    expect(result.models).toHaveLength(2)
    expect(result.models.map(m => m.id)).toContain('claude-1')
    expect(result.models.map(m => m.id)).toContain('claude-2')
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns unavailable when no API key for claude', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'claude')
    expect(result.source).toBe('unavailable')
  })

  it('stops pagination after 5 pages max', async () => {
    let pageCount = 0
    mockFetch = vi.fn().mockImplementation(async () => {
      pageCount++
      return {
        ok: true,
        json: async () => ({
          data: [{ id: `model-page-${pageCount}` }],
          has_more: true,
          last_id: `model-page-${pageCount}`,
        }),
      }
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ANTHROPIC_API_KEY = 'ant-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user5', 'claude')

    expect(mockFetch).toHaveBeenCalledTimes(5) // max 5 pages
    expect(result.models).toHaveLength(5)
    delete process.env.ANTHROPIC_API_KEY
  })
})

// ── getProviderModels — openrouter (public, no key required) ──────────────────

describe('getProviderModels — openrouter', () => {
  it('fetches models without requiring an API key', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'anthropic/claude-3', name: 'Claude 3', architecture: { output_modalities: ['text'] } },
          { id: 'openai/gpt-4', name: 'GPT-4' },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'openrouter')

    expect(result.source).toBe('live')
    expect(result.models.length).toBeGreaterThan(0)
  })

  it('filters out models with non-text output modalities', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'image-model', architecture: { output_modalities: ['image'] } },
          { id: 'text-model', architecture: { output_modalities: ['text'] } },
          { id: 'no-modality-model' }, // no modality = keep
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'openrouter')

    const ids = result.models.map(m => m.id)
    expect(ids).not.toContain('image-model')
    expect(ids).toContain('text-model')
    expect(ids).toContain('no-modality-model')
  })

  it('uses Authorization header when API key is available', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENROUTER_API_KEY = 'or-key'

    const { getProviderModels } = await loadModule({ OPENROUTER_API_KEY: 'or-saved' })
    await getProviderModels('user1', 'openrouter')

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers.Authorization).toContain('or-saved')
    delete process.env.OPENROUTER_API_KEY
  })
})

// ── getProviderModels — gemini ────────────────────────────────────────────────

describe('getProviderModels — gemini', () => {
  it('returns models that support generateContent', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.GOOGLE_GEMINI_API_KEY = 'gemini-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'gemini')

    expect(result.source).toBe('live')
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('gemini-2.5-flash') // 'models/' prefix stripped
    expect(ids).not.toContain('embedding-001')
    delete process.env.GOOGLE_GEMINI_API_KEY
  })

  it('returns unavailable when no API key for gemini', async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY
    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'gemini')
    expect(result.source).toBe('unavailable')
  })
})

// ── getProviderModels — ollama ────────────────────────────────────────────────

describe('getProviderModels — ollama', () => {
  it('returns models from the local Ollama server', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3:latest' }, { name: 'mistral:7b' }],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434'

    const { getProviderModels } = await loadModule({ OLLAMA_BASE_URL: 'http://localhost:11434' })
    const result = await getProviderModels('user1', 'ollama')

    expect(result.source).toBe('live')
    expect(result.models.map(m => m.id)).toContain('llama3:latest')
    delete process.env.OLLAMA_BASE_URL
  })

  it('strips trailing slash from base URL', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'model1' }] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule({ OLLAMA_BASE_URL: 'http://localhost:11434/' })
    await getProviderModels('user1', 'ollama')

    const url = mockFetch.mock.calls[0][0]
    expect(url).toBe('http://localhost:11434/api/tags')
  })

  it('returns unavailable when no base URL configured', async () => {
    delete process.env.OLLAMA_BASE_URL
    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'ollama')
    expect(result.source).toBe('unavailable')
  })
})

// ── getProviderModels — elevenlabs ────────────────────────────────────────────

describe('getProviderModels — elevenlabs', () => {
  it('returns TTS models from ElevenLabs', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        { model_id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1', can_do_text_to_speech: true },
        { model_id: 'eleven_non_tts', name: 'Non-TTS Model', can_do_text_to_speech: false },
      ]),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ELEVENLABS_API_KEY = 'el-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'elevenlabs')

    expect(result.source).toBe('live')
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('eleven_monolingual_v1')
    expect(ids).not.toContain('eleven_non_tts')
    delete process.env.ELEVENLABS_API_KEY
  })

  it('handles non-array response from ElevenLabs gracefully', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'unauthorized' }), // not an array
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ELEVENLABS_API_KEY = 'bad-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'elevenlabs')

    // Non-array body → Array.isArray check → empty models list
    expect(result.models).toHaveLength(0)
    delete process.env.ELEVENLABS_API_KEY
  })

  it('returns unavailable when no API key for elevenlabs', async () => {
    delete process.env.ELEVENLABS_API_KEY
    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'elevenlabs')
    expect(result.source).toBe('unavailable')
  })
})

// ── getProviderModels — perplexity (no list endpoint) ─────────────────────────

describe('getProviderModels — perplexity', () => {
  it('returns unavailable (no list endpoint)', async () => {
    process.env.PERPLEXITY_API_KEY = 'ppx-key'
    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user1', 'perplexity')
    expect(result.source).toBe('unavailable')
    delete process.env.PERPLEXITY_API_KEY
  })
})

// ── resolveSecret — encrypted value ───────────────────────────────────────────

describe('resolveSecret — encrypted settings', () => {
  it('decrypts an encrypted saved value', async () => {
    mockIsEncrypted.mockReturnValue(true)
    mockDecrypt.mockReturnValue('decrypted-key')
    mockFetch = makeOkFetch({ data: [{ id: 'gpt-4' }] })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule({ OPENAI_API_KEY: 'enc:cipher' })
    await getProviderModels('user1', 'openai')

    expect(mockDecrypt).toHaveBeenCalledWith('enc:cipher')
  })
})

// ── fetchJson — timeout ────────────────────────────────────────────────────────

describe('fetchJson — network errors', () => {
  it('returns unavailable when fetch times out', async () => {
    mockFetch = vi.fn().mockRejectedValue(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'sk-test'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user4', 'openai')
    expect(result.source).toBe('unavailable')
    delete process.env.OPENAI_API_KEY
  })
})

// ── mistral, deepseek, groq (OpenAI-compatible) ───────────────────────────────

describe('getProviderModels — mistral/deepseek/groq', () => {
  for (const [provider, envKey] of [
    ['mistral', 'MISTRAL_API_KEY'],
    ['deepseek', 'DEEPSEEK_API_KEY'],
    ['groq', 'GROQ_API_KEY'],
  ] as const) {
    it(`returns models for ${provider}`, async () => {
      mockFetch = makeOkFetch({ data: [{ id: `${provider}-model` }] })
      vi.stubGlobal('fetch', mockFetch)
      process.env[envKey] = 'test-key'

      vi.resetModules()
      const { getProviderModels } = await loadModule({ [envKey]: 'test-key' })
      const result = await getProviderModels('user1', provider as any)

      expect(result.source).toBe('live')
      delete process.env[envKey]
    })
  }
})

// ── readIntegrationsSettings — callback execution ──────────────────────────────

describe('readIntegrationsSettings — withAdminDb callback execution', () => {
  it('calls the withAdminDb callback with a drizzle db to build the query', async () => {
    // Make withAdminDb actually call its callback with a mock drizzle db
    // so we cover the anonymous function inside readIntegrationsSettings
    let capturedCallback: ((db: any) => any) | null = null

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ settings: { OPENAI_API_KEY: 'key-from-db' } }]),
    }

    mockWithAdminDb = vi.fn().mockImplementation(async (cb: any) => {
      capturedCallback = cb
      return await cb(mockDb)
    })

    mockFetch = makeOkFetch({ data: [{ id: 'gpt-4' }] })
    vi.stubGlobal('fetch', mockFetch)

    vi.doMock('@/lib/db', () => ({ withAdminDb: mockWithAdminDb }))
    vi.doMock('@/lib/db/schema', () => ({
      moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
    }))
    vi.doMock('drizzle-orm', () => ({
      and: vi.fn((...args: unknown[]) => ({ and: args })),
      eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
    }))
    vi.doMock('@/lib/crypto', () => ({
      decrypt: mockDecrypt,
      isEncrypted: vi.fn().mockReturnValue(false),
    }))
    vi.doMock('@/lib/constants', () => ({ INTEGRATIONS_MODULE_ID: 'integrations' }))

    const { getProviderModels } = await import('@/lib/ai-provider-models')
    const result = await getProviderModels('user1', 'openai')

    // The callback was called with the drizzle db
    expect(capturedCallback).not.toBeNull()
    expect(mockDb.select).toHaveBeenCalled()
    expect(result.source).toBe('live')
  })
})

// ── fetchJson — timeout callback ───────────────────────────────────────────────

describe('fetchJson — timeout abort callback', () => {
  it('the setTimeout abort callback fires when fetch takes too long', async () => {
    vi.useFakeTimers()

    // fetch hangs until abort signal fires
    mockFetch = vi.fn().mockImplementation(({ signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
        })
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    process.env.OPENAI_API_KEY = 'sk-test'
    const { getProviderModels } = await loadModule({ OPENAI_API_KEY: 'sk-test' })

    const promise = getProviderModels('user-timeout', 'openai')

    // Advance past the 7s fetchJson timeout
    await vi.advanceTimersByTimeAsync(8000)

    const result = await promise
    // The fetch was aborted → fetchModels throws → unavailable
    expect(result.source).toBe('unavailable')

    delete process.env.OPENAI_API_KEY
    vi.useRealTimers()
  })
})

// ── null/undefined defensive branches ────────────────────────────────────────

describe('fetchModels — null/undefined defensive branches', () => {
  it('handles missing data field (OpenAI-compat: json.data undefined)', async () => {
    // json.data is undefined → `json.data ?? []` fallback branch
    mockFetch = makeOkFetch({}) // no `data` field
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'sk-test'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-null', 'openai')
    expect(result.source).toBe('live')
    expect(result.models).toHaveLength(0)
    delete process.env.OPENAI_API_KEY
  })

  it('handles model entry with undefined id (OpenAI-compat: m.id ?? "")', async () => {
    // m.id is undefined → String(m.id ?? '') = ''
    mockFetch = makeOkFetch({ data: [{ id: undefined }, { id: 'gpt-4' }] })
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'sk-test'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-undef-id', 'openai')
    expect(result.source).toBe('live')
    // The model with empty id should be filtered by dedupe (empty string skipped)
    // Actually dedupe skips empty ids: `if (!m.id || seen.has(m.id)) continue`
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('gpt-4')
    delete process.env.OPENAI_API_KEY
  })

  it('skips claude model entries without id (m.id falsy)', async () => {
    // m.id is undefined → `if (m.id)` is false → not pushed
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: undefined, display_name: 'No ID Model' }, // skipped
          { id: 'claude-opus-4', display_name: 'Claude Opus 4' }, // included
        ],
        has_more: false,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ANTHROPIC_API_KEY = 'ant-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-claude-no-id', 'claude')
    expect(result.source).toBe('live')
    expect(result.models).toHaveLength(1)
    expect(result.models[0].id).toBe('claude-opus-4')
    delete process.env.ANTHROPIC_API_KEY
  })

  it('handles claude response with no data field (json.data ?? [])', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        // data is undefined → json.data ?? [] = []
        has_more: false,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ANTHROPIC_API_KEY = 'ant-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-claude-empty', 'claude')
    expect(result.source).toBe('live')
    expect(result.models).toHaveLength(0)
    delete process.env.ANTHROPIC_API_KEY
  })

  it('handles openrouter response with no data field (json.data ?? [])', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no data field
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-or-empty', 'openrouter')
    expect(result.source).toBe('live')
    expect(result.models).toHaveLength(0)
  })

  it('handles openrouter model entry with undefined id (m.id ?? "")', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { name: 'Some Model' }, // no id → m.id ?? '' = ''
          { id: 'real-model', name: 'Real' },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-or-no-id', 'openrouter')
    expect(result.source).toBe('live')
    // Empty id gets filtered by dedupe (`if (!m.id)`)
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('real-model')
  })

  // ── gemini null-check branches ───────────────────────────────────────────────

  it('handles gemini response with no models field (json.models ?? [])', async () => {
    // json.models is undefined → fallback to []
    mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)
    process.env.GOOGLE_GEMINI_API_KEY = 'gemini-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-gemini-empty', 'gemini')
    expect(result.source).toBe('live')
    expect(result.models).toHaveLength(0)
    delete process.env.GOOGLE_GEMINI_API_KEY
  })

  it('handles gemini model with undefined supportedGenerationMethods (m.supportedGenerationMethods ?? [])', async () => {
    // supportedGenerationMethods is undefined → filter sees [] → no generateContent → skipped
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-flash', displayName: 'Gemini Flash' }, // no supportedGenerationMethods
          { name: 'models/gemini-pro', displayName: 'Gemini Pro', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.GOOGLE_GEMINI_API_KEY = 'gemini-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-gemini-methods', 'gemini')
    expect(result.source).toBe('live')
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('gemini-pro')
    expect(ids).not.toContain('gemini-flash')
    delete process.env.GOOGLE_GEMINI_API_KEY
  })

  it('handles gemini model with undefined name (m.name ?? "")', async () => {
    // m.name is undefined → String(undefined ?? '') = ''
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { displayName: 'Unnamed Model', supportedGenerationMethods: ['generateContent'] }, // no name
          { name: 'models/gemini-known', displayName: 'Known', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.GOOGLE_GEMINI_API_KEY = 'gemini-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-gemini-noname', 'gemini')
    expect(result.source).toBe('live')
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('gemini-known')
    // Unnamed model gets empty id, filtered by dedupe
    delete process.env.GOOGLE_GEMINI_API_KEY
  })

  // ── ollama null-check branches ───────────────────────────────────────────────

  it('handles ollama response with no models field (json.models ?? [])', async () => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule({ OLLAMA_BASE_URL: 'http://localhost:11434' })
    const result = await getProviderModels('user-ollama-empty', 'ollama')
    expect(result.source).toBe('live')
    expect(result.models).toHaveLength(0)
  })

  it('handles ollama model with undefined name (m.name ?? "")', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {}, // no name field → String(undefined ?? '') = ''
          { name: 'llama3:latest' },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProviderModels } = await loadModule({ OLLAMA_BASE_URL: 'http://localhost:11434' })
    const result = await getProviderModels('user-ollama-noname', 'ollama')
    expect(result.source).toBe('live')
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('llama3:latest')
  })

  // ── elevenlabs null-check branch ─────────────────────────────────────────────

  it('handles elevenlabs model with undefined model_id (m.model_id ?? "")', async () => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        { name: 'Model Without ID', can_do_text_to_speech: true }, // no model_id
        { model_id: 'el-real', name: 'Real Model', can_do_text_to_speech: true },
      ]),
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.ELEVENLABS_API_KEY = 'el-key'

    const { getProviderModels } = await loadModule()
    const result = await getProviderModels('user-el-noid', 'elevenlabs')
    expect(result.source).toBe('live')
    const ids = result.models.map(m => m.id)
    expect(ids).toContain('el-real')
    delete process.env.ELEVENLABS_API_KEY
  })
})

// ── fetchJson — timeout abort callback ────────────────────────────────────────
// The anonymous arrow function `() => controller.abort()` at line 68 is the
// uncovered function. It fires when the 7-second setTimeout fires before the
// fetch resolves. We test this by using fake timers.

describe('fetchJson — 7-second timeout aborts fetch', () => {
  it('triggers the abort callback when fetch hangs for > 7 seconds', async () => {
    vi.useFakeTimers()

    // fetch returns a promise that only resolves when its signal is aborted
    mockFetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', mockFetch)
    process.env.OPENAI_API_KEY = 'sk-timeout-test'

    const { getProviderModels } = await loadModule({ OPENAI_API_KEY: 'sk-timeout-test' })

    // Start the request AND advance timers in parallel so the abort fires
    // while the promise is awaited.
    const fetchPromise = getProviderModels('user1', 'openai')
    await vi.advanceTimersByTimeAsync(7001)

    const result = await fetchPromise
    expect(result.source).toBe('unavailable')

    delete process.env.OPENAI_API_KEY
    vi.useRealTimers()
  }, 15000)
})
