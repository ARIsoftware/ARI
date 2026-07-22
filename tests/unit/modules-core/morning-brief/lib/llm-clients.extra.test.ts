/**
 * Extra coverage for morning-brief/lib/llm-clients.ts
 *
 * Uncovered branches:
 * - (108, '9', '1'): `json.content ?? []` fallback when content is undefined (Claude)
 * - (110, '10', '1'): `b.text ?? ''` when text is undefined in a content block (Claude)
 * - (134, '16', '1'): `p.text ?? ''` when text is undefined in a Gemini part
 * - `.catch(() => '')` fallbacks on error responses where res.text() rejects
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callLLM } from '@/modules-core/morning-brief/lib/llm-clients'
import type { CallLLMOptions } from '@/modules-core/morning-brief/lib/llm-clients'

const BASE_OPTS: Omit<CallLLMOptions, 'provider'> = {
  apiKey: 'test-key',
  model: 'test-model',
  system: 'You are a helper.',
  prompt: 'Say hello.',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('callLLM — error response where res.text() rejects', () => {
  it('OpenAI-compat: throws with empty body when text() rejects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => { throw new Error('stream closed') },
    } as unknown as Response)

    await expect(callLLM({ ...BASE_OPTS, provider: 'openai' })).rejects.toThrow('500')
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call).toBeDefined()
  })

  it('Anthropic (claude): throws with empty body when text() rejects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => { throw new Error('stream closed') },
    } as unknown as Response)

    await expect(callLLM({ ...BASE_OPTS, provider: 'claude' })).rejects.toThrow('401')
  })

  it('Gemini: throws with empty body when text() rejects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => { throw new Error('stream closed') },
    } as unknown as Response)

    await expect(callLLM({ ...BASE_OPTS, provider: 'gemini' })).rejects.toThrow('403')
  })
})

describe('callLLM — Claude (Anthropic) nullish coalescence branches', () => {
  it('uses [] when json.content is undefined (no content field)', async () => {
    // json.content is undefined → `json.content ?? []` uses the fallback []
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),  // no content field at all
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'claude' })
    expect(result.text).toBe('(no reply)')
  })

  it('uses empty string when content block has no text field', async () => {
    // b.text is undefined → `b.text ?? ''` uses ''
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text' /* no text property */ }],
      }),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'claude' })
    expect(result.text).toBe('(no reply)')
  })
})

describe('callLLM — Gemini nullish coalescence branches', () => {
  it('uses empty string when part has no text field', async () => {
    // p.text is undefined → `p.text ?? ''` uses ''
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ /* no text property */ }] } }],
      }),
    } as Response)
    const result = await callLLM({ ...BASE_OPTS, provider: 'gemini' })
    expect(result.text).toBe('(no reply)')
  })
})
