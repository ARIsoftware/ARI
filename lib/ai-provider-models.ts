/**
 * Live model discovery for AI providers (server-only).
 *
 * Given a provider id, this resolves the user's configured API key (from the
 * global `integrations` settings blob, decrypting secrets on the fly, with an
 * env-var fallback) and calls that provider's "list models" endpoint, then
 * normalizes the wildly different response shapes into a flat list of
 * `{ id, label? }`.
 *
 * The result is cached in-memory per provider for 8 hours and shared across all
 * module settings — the model list is provider-wide, not per-module, so one
 * fetch serves every card. Providers without a list endpoint (e.g. Perplexity)
 * or any fetch failure resolve to `source: 'unavailable'`, and the UI falls
 * back to a free-text model field.
 *
 * Used only by /api/settings/ai-providers/models — never import into client code
 * (it reads the database and decrypts secrets).
 */
import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { INTEGRATIONS_MODULE_ID } from '@/lib/constants'
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '@/lib/ai-providers'

export interface ProviderModel {
  /** The model id to send to the provider (what gets stored per-module). */
  id: string
  /** Optional human label (e.g. "Claude Opus 4.8"); falls back to the id. */
  label?: string
}

export interface ProviderModelsResult {
  models: ProviderModel[]
  /** 'live' = fetched/cached from the provider; 'unavailable' = no endpoint or fetch failed. */
  source: 'live' | 'unavailable'
}

const CACHE_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours
const cache = new Map<AiProviderId, { models: ProviderModel[]; expires: number }>()

/** Read the integrations settings blob for a user once (or {} if none). */
async function readIntegrationsSettings(userId: string): Promise<Record<string, unknown>> {
  const rows = await withAdminDb((db) =>
    db
      .select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(and(eq(moduleSettings.userId, userId), eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID)))
      .limit(1)
  )
  return (rows[0]?.settings ?? {}) as Record<string, unknown>
}

/** Saved value (decrypted) → env fallback → null. Holds the API key, or for
 *  Ollama (keyIsPlaintext) the base URL standing in for one. */
function resolveSecret(saved: Record<string, unknown>, envKey: string): string | null {
  const raw = saved[envKey]
  if (typeof raw === 'string' && raw.length > 0) {
    return isEncrypted(raw) ? decrypt(raw) : raw
  }
  const envVal = process.env[envKey]
  return envVal && envVal.length > 0 ? envVal : null
}

/** GET a JSON body with a hard timeout so a slow provider can't hang the route. */
async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok) throw new Error(`${url} → ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

/** Push obviously-non-chat models (embeddings, audio, image) to the bottom
 *  without dropping anything — the user can still find them via search. */
const NON_CHAT = /(embed|whisper|tts|dall-?e|moderation|transcrib|stable-?diffusion|image|rerank|guard)/i
function chatFirst(models: ProviderModel[]): ProviderModel[] {
  const keep = models.filter((m) => !NON_CHAT.test(m.id))
  const demote = models.filter((m) => NON_CHAT.test(m.id))
  return [...keep, ...demote]
}

function dedupe(models: ProviderModel[]): ProviderModel[] {
  const seen = new Set<string>()
  const out: ProviderModel[] = []
  for (const m of models) {
    if (!m.id || seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out
}

// OpenAI-compatible "list models" endpoints — identical `{ data: [{ id }] }` shape.
const OPENAI_COMPATIBLE_URL: Partial<Record<AiProviderId, string>> = {
  openai: 'https://api.openai.com/v1/models',
  xai: 'https://api.x.ai/v1/models',
  mistral: 'https://api.mistral.ai/v1/models',
  deepseek: 'https://api.deepseek.com/models',
  groq: 'https://api.groq.com/openai/v1/models',
}

/**
 * Hit a provider's list-models endpoint and normalize the response. Throws when
 * the provider has no list endpoint (Perplexity), the credential is missing, or
 * the request fails — the caller treats any throw as `unavailable`.
 */
async function fetchModels(provider: AiProvider, secret: string | null): Promise<ProviderModel[]> {
  const id = provider.id

  // OpenAI-compatible: { data: [{ id }] }
  if (OPENAI_COMPATIBLE_URL[id]) {
    if (!secret) throw new Error('no api key')
    const json = (await fetchJson(OPENAI_COMPATIBLE_URL[id]!, {
      Authorization: `Bearer ${secret}`,
    })) as { data?: Array<{ id?: string }> }
    return chatFirst(dedupe((json.data ?? []).map((m) => ({ id: String(m.id ?? '') }))))
  }

  // Anthropic: { data: [{ id, display_name }], has_more, last_id } — paginated.
  if (id === 'claude') {
    if (!secret) throw new Error('no api key')
    const out: ProviderModel[] = []
    let afterId: string | undefined
    for (let page = 0; page < 5; page++) {
      const url = new URL('https://api.anthropic.com/v1/models')
      url.searchParams.set('limit', '100')
      if (afterId) url.searchParams.set('after_id', afterId)
      const json = (await fetchJson(url.toString(), {
        'x-api-key': secret,
        'anthropic-version': '2023-06-01',
      })) as { data?: Array<{ id?: string; display_name?: string }>; has_more?: boolean; last_id?: string }
      for (const m of json.data ?? []) {
        if (m.id) out.push({ id: m.id, label: m.display_name })
      }
      if (!json.has_more || !json.last_id) break
      afterId = json.last_id
    }
    return dedupe(out)
  }

  // OpenRouter: { data: [{ id, name, architecture: { output_modalities } }] }
  if (id === 'openrouter') {
    const headers: Record<string, string> = secret ? { Authorization: `Bearer ${secret}` } : {}
    const json = (await fetchJson('https://openrouter.ai/api/v1/models', headers)) as {
      data?: Array<{ id?: string; name?: string; architecture?: { output_modalities?: string[] } }>
    }
    const models = (json.data ?? [])
      // Keep text-output models; keep entries with no modality metadata.
      .filter((m) => {
        const out = m.architecture?.output_modalities
        return !out || out.includes('text')
      })
      .map((m) => ({ id: String(m.id ?? ''), label: m.name }))
    return dedupe(models)
  }

  // Google Gemini: { models: [{ name: "models/…", displayName, supportedGenerationMethods }] }
  if (id === 'gemini') {
    if (!secret) throw new Error('no api key')
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secret)}&pageSize=200`
    const json = (await fetchJson(url, {})) as {
      models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>
    }
    const models = (json.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => ({ id: String(m.name ?? '').replace(/^models\//, ''), label: m.displayName }))
    return dedupe(models)
  }

  // Ollama: { models: [{ name }] } from the user's base URL (secret = base URL).
  if (id === 'ollama') {
    if (!secret) throw new Error('no base url')
    const base = secret.replace(/\/+$/, '')
    const json = (await fetchJson(`${base}/api/tags`, {})) as { models?: Array<{ name?: string }> }
    return dedupe((json.models ?? []).map((m) => ({ id: String(m.name ?? '') })))
  }

  // ElevenLabs (voice): [{ model_id, name, can_do_text_to_speech }]
  if (id === 'elevenlabs') {
    if (!secret) throw new Error('no api key')
    const json = (await fetchJson('https://api.elevenlabs.io/v1/models', { 'xi-api-key': secret })) as Array<{
      model_id?: string
      name?: string
      can_do_text_to_speech?: boolean
    }>
    const models = (Array.isArray(json) ? json : [])
      .filter((m) => m.can_do_text_to_speech !== false)
      .map((m) => ({ id: String(m.model_id ?? ''), label: m.name }))
    return dedupe(models)
  }

  // Perplexity and anything else: no public list endpoint.
  throw new Error('no list endpoint')
}

function providerById(providerId: AiProviderId): AiProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === providerId)
}

/**
 * Resolve the model list for a provider, using the 8h in-memory cache when warm.
 * Never throws — failures resolve to `{ models: [], source: 'unavailable' }`.
 */
export async function getProviderModels(userId: string, providerId: AiProviderId): Promise<ProviderModelsResult> {
  const provider = providerById(providerId)
  if (!provider) return { models: [], source: 'unavailable' }

  const cached = cache.get(providerId)
  if (cached && cached.expires > Date.now()) {
    return { models: cached.models, source: 'live' }
  }

  try {
    const saved = await readIntegrationsSettings(userId)
    const secret = resolveSecret(saved, provider.primaryEnvKey)
    const models = await fetchModels(provider, secret)
    // Cache successful fetches (including a legitimately empty list).
    cache.set(providerId, { models, expires: Date.now() + CACHE_TTL_MS })
    return { models, source: 'live' }
  } catch {
    // No endpoint / no key / network error → let the UI fall back to manual entry.
    return { models: [], source: 'unavailable' }
  }
}
