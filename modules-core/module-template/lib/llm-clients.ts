/**
 * Module Template - Lightweight LLM client
 *
 * A single non-streaming `callLLM()` that covers all 10 providers in
 * `@/lib/ai-providers` via three adapters, using plain `fetch` (no SDKs):
 *   - OpenAI-compatible `/chat/completions` — openai, openrouter, groq,
 *     deepseek, xai, mistral, perplexity, and ollama (self-hosted).
 *   - Anthropic `/v1/messages`.
 *   - Gemini `:generateContent`.
 *
 * Kept deliberately small — it's the demo consumption path that turns a user's
 * selected provider into a real response. Streaming/token-counting variants
 * live in the chat/agents modules if a real module needs them.
 */
import type { AiProviderId } from '@/lib/ai-providers'

export interface CallLLMOptions {
  provider: AiProviderId
  /** Resolved API key. For Ollama this is the base URL (it has no secret). */
  apiKey: string
  model: string
  system: string
  prompt: string
}

// Base URLs for the OpenAI-compatible `/chat/completions` providers.
const OPENAI_COMPATIBLE_BASE: Partial<Record<AiProviderId, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com',
  xai: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  perplexity: 'https://api.perplexity.ai',
}

export async function callLLM(opts: CallLLMOptions): Promise<{ text: string }> {
  switch (opts.provider) {
    case 'claude':
      return callAnthropic(opts)
    case 'gemini':
      return callGemini(opts)
    case 'ollama':
      return callOpenAICompatible(opts, trimSlash(opts.apiKey) + '/v1', null)
    default: {
      const base = OPENAI_COMPATIBLE_BASE[opts.provider]
      if (!base) throw new Error(`Unsupported provider: ${opts.provider}`)
      return callOpenAICompatible(opts, base, opts.apiKey)
    }
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * OpenAI chat-completions schema. `apiKey` may be null for keyless endpoints
 * (Ollama), in which case no Authorization header is sent.
 */
async function callOpenAICompatible(
  opts: CallLLMOptions,
  base: string,
  apiKey: string | null,
): Promise<{ text: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`${opts.provider} returned ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return { text: (json.choices?.[0]?.message?.content ?? '').trim() || '(no reply)' }
}

async function callAnthropic(opts: CallLLMOptions): Promise<{ text: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      system: opts.system,
      max_tokens: 1024,
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  })
  if (!res.ok) {
    throw new Error(`claude returned ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = (json.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim()
  return { text: text || '(no reply)' }
}

async function callGemini(opts: CallLLMOptions): Promise<{ text: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    }),
  })
  if (!res.ok) {
    throw new Error(`gemini returned ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const parts = json.candidates?.[0]?.content?.parts ?? []
  return { text: parts.map((p) => p.text ?? '').join('').trim() || '(no reply)' }
}
