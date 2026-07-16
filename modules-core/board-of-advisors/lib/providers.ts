/**
 * LLM provider abstraction for the Board of Advisors module.
 *
 * Reads API keys from the same encrypted store used by Settings → Integrations
 * (`module_settings` row with `module_id = 'integrations'`), with `process.env`
 * fallback. Exposes a unified `streamCompletion()` that emits text deltas.
 *
 * Every chat provider in ARI's registry is supported: Claude and Gemini have
 * native clients; OpenAI, OpenRouter, xAI, Mistral, DeepSeek, Groq, Perplexity,
 * and Ollama all speak the OpenAI chat-completions protocol.
 */

import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { INTEGRATIONS_MODULE_ID } from '@/lib/constants'
import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'

const OPENAI_COMPAT_BASE: Partial<Record<AiProviderId, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  xai: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  perplexity: 'https://api.perplexity.ai',
}

export type IntegrationSettings = Record<string, unknown>

/** One DB read of the user's Settings → Integrations blob; pass the result to
 *  the sync helpers below so a request never re-reads it. */
export async function readIntegrationSettings(userId: string): Promise<IntegrationSettings> {
  const rows = await withAdminDb(async (db) =>
    db
      .select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(and(eq(moduleSettings.userId, userId), eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID)))
      .limit(1)
  )
  return (rows[0]?.settings ?? {}) as IntegrationSettings
}

/** Saved value (decrypted if a stored secret) → process.env fallback → null. */
function resolveEnvValue(saved: IntegrationSettings, envKey: string): string | null {
  const raw = saved[envKey]
  if (typeof raw === 'string' && raw.length > 0) {
    return isEncrypted(raw) ? decrypt(raw) : raw
  }
  const envVal = process.env[envKey]
  return envVal && envVal.length > 0 ? envVal : null
}

export type ResolvedBoardProvider =
  | { ok: true; provider: AiProviderId; providerName: string; modelId: string; apiKey: string }
  | { ok: false; reason: 'none' | 'unsupported' | 'nokey'; providerName: string }

/**
 * Resolve the module's AI Providers selection into a concrete provider, model,
 * and API key, given an already-loaded integrations blob. Model resolution:
 * per-module override (aiProviderModels) → the global <PROVIDER>_MODEL from
 * Integrations → the provider's registry default. For Ollama the "key" is the
 * base URL; its placeholder is a usable default.
 */
export function resolveBoardProviderFrom(
  saved: IntegrationSettings,
  selected: AiProviderId | null,
  modelOverrides: Partial<Record<AiProviderId, string>> | undefined,
): ResolvedBoardProvider {
  if (!selected) return { ok: false, reason: 'none', providerName: '' }

  const registry = AI_PROVIDERS.find((p) => p.id === selected)
  const providerName = registry?.name ?? selected
  if (!registry || registry.kind === 'voice') {
    return { ok: false, reason: 'unsupported', providerName }
  }

  let apiKey = resolveEnvValue(saved, registry.primaryEnvKey)
  if (!apiKey && registry.keyIsPlaintext && registry.primaryPlaceholder) {
    apiKey = registry.primaryPlaceholder
  }
  if (!apiKey) return { ok: false, reason: 'nokey', providerName }

  const override = modelOverrides?.[selected]?.trim()
  const modelId = override || resolveEnvValue(saved, registry.modelEnvKey) || registry.modelPlaceholder
  return { ok: true, provider: selected, providerName, modelId, apiKey }
}

/**
 * True when the user explicitly configured the provider (stored value or env
 * var). Placeholder-only defaults (e.g. Ollama's localhost URL) don't count —
 * this powers the "have you added any key yet?" UI state.
 */
export function isProviderConfiguredIn(saved: IntegrationSettings, provider: AiProviderId): boolean {
  const registry = AI_PROVIDERS.find((p) => p.id === provider)
  if (!registry) return false
  return !!resolveEnvValue(saved, registry.primaryEnvKey)
}

// ─── Unified streaming completion ──────────────────────────────────────

/**
 * Error type for everything that goes wrong talking to an LLM provider.
 * The messages route uses `instanceof ProviderError` to decide which error
 * text is safe to show the client — provider errors are the user's own
 * provider talking; anything else stays generic.
 */
export class ProviderError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
  }
}

export interface StreamCompletionOptions {
  provider: AiProviderId
  model: string
  apiKey: string
  system: string
  prompt: string
  /** Aborts the provider request (e.g. when the SSE client disconnects). */
  signal?: AbortSignal
}

export async function* streamCompletion(opts: StreamCompletionOptions): AsyncGenerator<string> {
  if (opts.provider === 'claude') {
    yield* streamAnthropic(opts)
    return
  }
  if (opts.provider === 'gemini') {
    yield* streamGemini(opts)
    return
  }
  if (opts.provider === 'ollama') {
    const base = validateOllamaBaseUrl(opts.apiKey)
    // The base URL is user-configurable, so never reflect the endpoint's
    // response bodies back to the client (SSRF read-primitive otherwise).
    yield* streamOpenAICompat(opts, `${base}/v1`, { sendAuth: false, reflectErrorBody: false })
    return
  }
  const base = OPENAI_COMPAT_BASE[opts.provider]
  if (!base) throw new ProviderError(`${opts.provider} is not supported by the Board of Advisors module. Pick another provider in Board of Advisors → Settings.`)
  yield* streamOpenAICompat(opts, base, { sendAuth: true, reflectErrorBody: true })
}

/** The Ollama "key" is a base URL — require a plain http(s) origin. */
function validateOllamaBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ProviderError('The Ollama base URL is not a valid URL. Fix it in Settings → Integrations.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProviderError('The Ollama base URL must start with http:// or https://.')
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

async function* streamOpenAICompat(
  opts: StreamCompletionOptions,
  baseURL: string,
  { sendAuth, reflectErrorBody }: { sendAuth: boolean; reflectErrorBody: boolean },
): AsyncGenerator<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sendAuth) headers.Authorization = `Bearer ${opts.apiKey}`

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    }),
  })

  if (!res.ok || !res.body) {
    if (!reflectErrorBody) {
      throw new ProviderError(`Provider request failed (${res.status})`, res.status)
    }
    throw await httpProviderError(res)
  }

  yield* parseSSEDeltas(res.body, (json) => {
    // OpenAI-compatible endpoints report mid-stream failures as an error
    // frame inside a 200 stream — surface it instead of ending "cleanly".
    if (json.error) {
      throw new ProviderError(`Provider stream error: ${frameErrorDetail(json.error)}`)
    }
    return json.choices?.[0]?.delta?.content ?? ''
  })
}

async function* streamAnthropic(opts: StreamCompletionOptions): AsyncGenerator<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4096,
      stream: true,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  })

  if (!res.ok || !res.body) {
    throw await httpProviderError(res)
  }

  yield* parseSSEDeltas(res.body, (json) => {
    // Anthropic reports mid-stream failures as an error event inside the
    // 200 stream (e.g. overloaded_error) — surface it.
    if (json.type === 'error') {
      throw new ProviderError(`Provider stream error: ${frameErrorDetail(json.error)}`)
    }
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return json.delta.text ?? ''
    }
    return ''
  })
}

async function* streamGemini(opts: StreamCompletionOptions): AsyncGenerator<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Header, not ?key= query param — URLs end up in proxy/egress logs.
      'x-goog-api-key': opts.apiKey,
    },
    signal: opts.signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      systemInstruction: { parts: [{ text: opts.system }] },
    }),
  })

  if (!res.ok || !res.body) {
    throw await httpProviderError(res)
  }

  yield* parseSSEDeltas(res.body, (json) => {
    if (json.error) {
      throw new ProviderError(`Provider stream error: ${frameErrorDetail(json.error)}`)
    }
    const parts = json.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ''
    return parts.map((p: { text?: string }) => p.text ?? '').join('')
  })
}

// ─── SSE helpers ───────────────────────────────────────────────────────

/** Hard cap on the un-newline-terminated SSE parse buffer — a misbehaving
 *  endpoint that streams bytes without newlines must not grow memory unboundedly. */
const SSE_BUFFER_MAX_CHARS = 1_000_000

// `any` here keeps providers free to peek at whatever shape their SSE
// frames carry without us having to model the full schema.
async function* parseSSEDeltas(
  body: ReadableStream<Uint8Array>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pick: (json: any) => string
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    if (buffer.length > SSE_BUFFER_MAX_CHARS) {
      await reader.cancel().catch(() => {})
      throw new ProviderError('The provider stream sent an oversized frame.')
    }

    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line || !line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return

      // Parse failures are ignored (keep-alives / malformed frames), but a
      // throw from pick() — an in-band provider error frame — must propagate.
      let json: unknown
      try {
        json = JSON.parse(data)
      } catch {
        continue
      }
      const piece = pick(json)
      if (piece) yield piece
    }
  }
}

/** Extract a compact human-readable detail from an in-band error frame. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function frameErrorDetail(err: any): string {
  const message = typeof err?.message === 'string' ? err.message : ''
  const type = typeof err?.type === 'string' ? err.type : ''
  const detail = [type, message].filter(Boolean).join(': ')
  return (detail || JSON.stringify(err ?? {})).slice(0, 500)
}

async function httpProviderError(res: Response): Promise<ProviderError> {
  try {
    const text = await res.text()
    return new ProviderError(`Provider request failed (${res.status}): ${text.slice(0, 500)}`, res.status)
  } catch {
    return new ProviderError(`Provider request failed (${res.status})`, res.status)
  }
}
