import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callLLM } from '@/modules-core/morning-brief/lib/llm-clients'
import type { CallLLMOptions } from '@/modules-core/morning-brief/lib/llm-clients'

const BASE_OPTS: Omit<CallLLMOptions, 'provider'> = {
  apiKey: 'test-key',
  model: 'test-model',
  system: 'You are a helper.',
  prompt: 'Say hello.',
}

function makeOpenAIResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  } as Response
}

function makeAnthropicResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }] }),
    text: async () => text,
  } as Response
}

function makeGeminiResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: async () => text,
  } as Response
}

function makeErrorResponse(status: number, body = 'error') {
  return {
    ok: false,
    status,
    json: async () => { throw new Error('not json') },
    text: async () => body,
  } as unknown as Response
}

describe('callLLM — OpenAI-compatible providers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const openAICompatibleProviders = [
    'openai', 'openrouter', 'groq', 'deepseek', 'xai', 'mistral', 'perplexity',
  ] as const

  for (const provider of openAICompatibleProviders) {
    it(`calls /chat/completions for provider: ${provider}`, async () => {
      vi.mocked(fetch).mockResolvedValueOnce(makeOpenAIResponse('Hi there!'))
      const result = await callLLM({ ...BASE_OPTS, provider })
      expect(result.text).toBe('Hi there!')
      const [url, init] = vi.mocked(fetch).mock.calls[0]
      expect(url as string).toContain('/chat/completions')
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[1].role).toBe('user')
      expect(body.messages[1].content).toBe('Say hello.')
    })
  }

  it('sends Authorization header for keyed providers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOpenAIResponse('Hello'))
    await callLLM({ ...BASE_OPTS, provider: 'openai' })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: 'Bearer test-key',
    })
  })

  it('uses custom maxTokens when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOpenAIResponse('Hi'))
    await callLLM({ ...BASE_OPTS, provider: 'openai', maxTokens: 100 })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.max_tokens).toBe(100)
  })

  it('defaults maxTokens to 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOpenAIResponse('Hi'))
    await callLLM({ ...BASE_OPTS, provider: 'openai' })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.max_tokens).toBe(400)
  })

  it('returns (no reply) when content is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOpenAIResponse(''))
    const result = await callLLM({ ...BASE_OPTS, provider: 'openai' })
    expect(result.text).toBe('(no reply)')
  })

  it('returns (no reply) when choices is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'openai' })
    expect(result.text).toBe('(no reply)')
  })

  it('throws on non-ok response from OpenAI provider', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(401, 'Unauthorized'))
    await expect(callLLM({ ...BASE_OPTS, provider: 'openai' })).rejects.toThrow('401')
  })
})

describe('callLLM — Ollama (OpenAI-compatible, keyless)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses apiKey as base URL with trailing slash stripped', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOpenAIResponse('Hello from Ollama'))
    const result = await callLLM({ ...BASE_OPTS, provider: 'ollama', apiKey: 'http://localhost:11434/' })
    expect(result.text).toBe('Hello from Ollama')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url as string).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('does not send Authorization header for ollama', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOpenAIResponse('Hi'))
    await callLLM({ ...BASE_OPTS, provider: 'ollama', apiKey: 'http://localhost:11434' })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization')
  })
})

describe('callLLM — Anthropic (Claude)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls Anthropic messages endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeAnthropicResponse('Hi from Claude'))
    const result = await callLLM({ ...BASE_OPTS, provider: 'claude' })
    expect(result.text).toBe('Hi from Claude')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url as string).toBe('https://api.anthropic.com/v1/messages')
  })

  it('uses x-api-key header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeAnthropicResponse('Hi'))
    await callLLM({ ...BASE_OPTS, provider: 'claude' })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      'x-api-key': 'test-key',
    })
  })

  it('concatenates multiple text content blocks', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' world' },
        ],
      }),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'claude' })
    expect(result.text).toBe('Hello world')
  })

  it('filters out non-text content blocks', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          { type: 'tool_use', id: 'x' },
          { type: 'text', text: 'Only this' },
        ],
      }),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'claude' })
    expect(result.text).toBe('Only this')
  })

  it('returns (no reply) when content array is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [] }),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'claude' })
    expect(result.text).toBe('(no reply)')
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(403, 'Forbidden'))
    await expect(callLLM({ ...BASE_OPTS, provider: 'claude' })).rejects.toThrow('403')
  })
})

describe('callLLM — Gemini', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls Gemini generateContent endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeGeminiResponse('Hello from Gemini'))
    const result = await callLLM({ ...BASE_OPTS, provider: 'gemini' })
    expect(result.text).toBe('Hello from Gemini')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url as string).toContain('generativelanguage.googleapis.com')
    expect(url as string).toContain(':generateContent')
  })

  it('encodes model and apiKey in URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeGeminiResponse('Hi'))
    await callLLM({ ...BASE_OPTS, provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'my-key' })
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url as string).toContain('gemini-1.5-flash')
    expect(url as string).toContain('key=my-key')
  })

  it('returns (no reply) when no candidates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] }),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'gemini' })
    expect(result.text).toBe('(no reply)')
  })

  it('concatenates multiple parts', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello' }, { text: ' world' }] } }],
      }),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'gemini' })
    expect(result.text).toBe('Hello world')
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(429, 'Rate limited'))
    await expect(callLLM({ ...BASE_OPTS, provider: 'gemini' })).rejects.toThrow('429')
  })
})

describe('callLLM — unsupported provider', () => {
  it('throws for unknown provider', async () => {
    await expect(
      callLLM({ ...BASE_OPTS, provider: 'unknown-provider' as never })
    ).rejects.toThrow('Unsupported provider')
  })
})
