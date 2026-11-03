/**
 * LLM provider abstraction for the Chat module.
 *
 * Reads API keys from the same encrypted store used by Settings → Integrations
 * (`module_settings` row with `module_id = 'integrations'`), with `process.env`
 * fallback. Exposes a unified `streamChat()` that emits text deltas across
 * every chat provider in the shared registry: Anthropic and Gemini natively,
 * Ollama via its OpenAI-compatible endpoint, everything else via
 * OpenAI-compatible `/chat/completions`.
 *
 * All file attachments are passed inline:
 *  - Images go as base64 image parts to vision-capable models.
 *  - Text/markdown/csv/json are inlined into the prompt as fenced text.
 */

import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { INTEGRATIONS_MODULE_ID } from '@/lib/constants'
import { getStorageProvider, readStorageConfig, sanitizeBucketName, validateStoredFilename } from '@/lib/storage'
import { CHAT_PROVIDER_IDS, chatProviderMeta } from './utils'
import { DEFAULT_IMAGE_MODELS, pickImageProvider } from './image-gen'
import type { ImageConfig } from './reply'
import type { ChatAttachment, ChatProvider, ChatMessage } from '../types'

async function readIntegrationSettings(userId: string): Promise<Record<string, unknown>> {
  const rows = await withAdminDb(async (db) =>
    db
      .select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(and(eq(moduleSettings.userId, userId), eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID)))
      .limit(1)
  )
  return (rows[0]?.settings ?? {}) as Record<string, unknown>
}

function resolveSecret(envKey: string, saved: Record<string, unknown>): string | null {
  const raw = saved[envKey]
  if (typeof raw === 'string' && raw.length > 0) {
    return isEncrypted(raw) ? decrypt(raw) : raw
  }
  const envVal = process.env[envKey]
  return envVal ? envVal : null
}

function resolveModel(envKey: string, saved: Record<string, unknown>, fallback: string): string {
  const raw = saved[envKey]
  if (typeof raw === 'string' && raw.length > 0) return raw
  const envVal = process.env[envKey]
  if (envVal) return envVal
  return fallback
}

export async function getProviderApiKey(userId: string, provider: ChatProvider): Promise<string | null> {
  const saved = await readIntegrationSettings(userId)
  return resolveSecret(chatProviderMeta(provider).primaryEnvKey, saved)
}

export async function getProviderConfiguredModel(userId: string, provider: ChatProvider): Promise<string> {
  const saved = await readIntegrationSettings(userId)
  const meta = chatProviderMeta(provider)
  return resolveModel(meta.modelEnvKey, saved, meta.modelPlaceholder)
}

/**
 * Where this chat's images are made: its own provider when that one can make
 * images, else the first image provider with a key. Null when none has a key.
 */
export async function resolveImageConfig(userId: string, chatProvider: ChatProvider): Promise<ImageConfig | null> {
  const saved = await readIntegrationSettings(userId)
  const keyFor = (p: ChatProvider) => resolveSecret(chatProviderMeta(p).primaryEnvKey, saved)
  const provider = pickImageProvider(chatProvider, (p) => !!keyFor(p))
  if (!provider) return null
  return { provider, apiKey: keyFor(provider)!, model: DEFAULT_IMAGE_MODELS[provider] }
}

export interface ProviderAvailability {
  provider: ChatProvider
  configured: boolean
  configuredModel: string | null
  defaultModel: string
}

export async function listProviderAvailability(userId: string): Promise<ProviderAvailability[]> {
  const saved = await readIntegrationSettings(userId)
  return CHAT_PROVIDER_IDS.map((provider) => {
    const meta = chatProviderMeta(provider)
    const key = resolveSecret(meta.primaryEnvKey, saved)
    const rawModel = saved[meta.modelEnvKey]
    const envModel = process.env[meta.modelEnvKey]
    const configuredModel = typeof rawModel === 'string' && rawModel.length > 0
      ? rawModel
      : envModel && envModel.length > 0
        ? envModel
        : null
    return {
      provider,
      configured: !!key,
      configuredModel,
      defaultModel: meta.modelPlaceholder,
    }
  })
}

// ─── Attachment expansion ──────────────────────────────────────────────

export interface ExpandedAttachment {
  kind: 'image' | 'text'
  attachment: ChatAttachment
  base64?: string
  text?: string
  /** True when the file could not be loaded (deleted/unavailable). */
  missing?: boolean
}

// Names are interpolated into fenced prompt sections; neutralize backticks so
// a crafted filename can't break out of the code fence.
function fenceName(name: string): string {
  return name.replace(/`/g, "'")
}

// Append an attachment's expanded content to a running text body. A missing
// file is surfaced as a plain note (never as fenced "content" the model would
// treat as the file's body).
function appendTextAttachment(body: string, e: ExpandedAttachment): string {
  const name = fenceName(e.attachment.original_name)
  if (e.missing) return `${body}\n\n[Attachment "${name}" is unavailable.]`
  return `${body}\n\n[Attachment: ${name}]\n\`\`\`\n${e.text}\n\`\`\``
}

// Providers like Anthropic and Gemini require the message list to start with a
// user turn and to strictly alternate roles. Drop any leading assistant turns
// (e.g. after windowing) and coalesce consecutive same-role turns so a failed
// send (user turn with no reply) can't brick the conversation.
function normalizeTurns(turns: ChatMessage[]): ChatMessage[] {
  let start = 0
  while (start < turns.length && turns[start].role !== 'user') start++
  const merged: ChatMessage[] = []
  for (const t of turns.slice(start)) {
    const prev = merged[merged.length - 1]
    if (prev && prev.role === t.role) {
      prev.content = `${prev.content}\n\n${t.content}`
      prev.attachments = [...prev.attachments, ...t.attachments]
    } else {
      merged.push({ ...t, attachments: [...t.attachments] })
    }
  }
  return merged
}

async function downloadAttachment(userId: string, attachment: ChatAttachment): Promise<Buffer | null> {
  // Stored metadata is rebuilt from owned upload rows at send time, but
  // legacy message rows may carry arbitrary values — reject anything that
  // isn't a plain stored filename/bucket before touching storage.
  const filename = validateStoredFilename(attachment.filename)
  if (!filename) return null
  let bucket: string
  try {
    bucket = sanitizeBucketName(attachment.bucket)
  } catch {
    return null
  }
  if (bucket !== attachment.bucket) return null

  const storage = getStorageProvider(readStorageConfig())
  const result = await storage.serve(userId, bucket, filename)
  if (!result) return null
  const reader = result.stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

async function expandAttachment(userId: string, attachment: ChatAttachment): Promise<ExpandedAttachment | null> {
  const mime = attachment.mime
  let buf: Buffer | null = null
  try {
    buf = await downloadAttachment(userId, attachment)
  } catch {
    buf = null
  }

  // A deleted or invalid upload must not break the whole conversation —
  // degrade to a note the model (and user) can see, flagged as missing so it
  // is not rendered as file content.
  if (!buf) {
    return { kind: 'text', attachment, missing: true }
  }

  if (mime.startsWith('image/')) {
    return { kind: 'image', attachment, base64: buf.toString('base64') }
  }

  if (mime.startsWith('text/') || mime === 'application/json') {
    return { kind: 'text', attachment, text: buf.toString('utf-8') }
  }

  return null
}

export async function expandAttachments(
  userId: string,
  attachments: ChatAttachment[]
): Promise<ExpandedAttachment[]> {
  const out: ExpandedAttachment[] = []
  for (const att of attachments) {
    const expanded = await expandAttachment(userId, att)
    if (expanded) out.push(expanded)
  }
  return out
}

// ─── Unified streaming chat ────────────────────────────────────────────

export interface StreamChatOptions {
  userId: string
  provider: ChatProvider
  model: string
  history: ChatMessage[]
  apiKey: string
  signal?: AbortSignal
  /** Offer the model the `generate_image` tool. */
  imageTool?: boolean
}

/** A tool the model asked to call, with its parsed arguments. */
export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

// ─── The image tool ────────────────────────────────────────────────────

export const IMAGE_TOOL_NAME = 'generate_image'
const IMAGE_TOOL_DESCRIPTION =
  'Create an image from a text description. Call this whenever the user asks you to draw, generate, ' +
  'create or design an image, picture, illustration, logo or photo. The image is shown to the user ' +
  'right below your message, so do not describe it at length or link to it.'
const IMAGE_TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'A detailed description of the image: subject, style, composition, colours and mood.',
    },
  },
  required: ['prompt'],
}

// Providers whose API has no tool calling — never offered the tool.
const NO_TOOL_PROVIDERS = new Set<ChatProvider>(['perplexity'])

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The text a past assistant turn is replayed with. Images on an assistant
 * turn were generated by the image tool (users can't attach to replies); a
 * note keeps the model aware of them, and keeps an image-only turn non-empty
 * (Anthropic rejects empty text).
 */
function assistantText(msg: ChatMessage): string {
  const notes = (msg.attachments ?? [])
    .filter((a) => a.mime.startsWith('image/'))
    .map((a) => `[Generated image: ${a.original_name}]`)
  return [msg.content, ...notes].filter(Boolean).join('\n\n')
}

// OpenAI-compatible `/chat/completions` base URLs. A registry provider missing
// from here (and not handled natively below) fails with a clear error.
const OPENAI_COMPAT_BASE: Partial<Record<ChatProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  xai: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  perplexity: 'https://api.perplexity.ai',
  cohere: 'https://api.cohere.ai/compatibility/v1',
}

// OpenAI and OpenRouter take any message order; the other compatible APIs
// (Perplexity, Mistral, …) want one leading system message and alternating
// user/assistant turns, so their history is normalized first.
const PERMISSIVE_ORDER = new Set<ChatProvider>(['openai', 'openrouter'])

/**
 * Stream a reply as text deltas. The generator's return value is the tool
 * calls the model made (empty when it only wrote text) — Chat runs them after
 * the text, and the reply ends there (no second model turn).
 */
export async function* streamChat(opts: StreamChatOptions): AsyncGenerator<string, ToolCall[]> {
  const o = { ...opts, imageTool: !!opts.imageTool && !NO_TOOL_PROVIDERS.has(opts.provider) }
  switch (o.provider) {
    case 'anthropic':
      return yield* streamAnthropic(o)
    case 'gemini':
      return yield* streamGemini(o)
    case 'ollama':
      // The "key" is the user's base URL. Never reflect that endpoint's
      // response bodies back to the client (SSRF read-primitive otherwise).
      return yield* streamOpenAI(o, `${validateOllamaBaseUrl(o.apiKey)}/v1`, {
        sendAuth: false,
        reflectErrorBody: false,
        normalize: true,
      })
  }
  const base = OPENAI_COMPAT_BASE[o.provider]
  if (!base) throw new Error(`${o.provider} is not supported by Chat. Pick another provider.`)
  return yield* streamOpenAI(o, base, { normalize: !PERMISSIVE_ORDER.has(o.provider) })
}

/** The Ollama "key" is a base URL — require a plain http(s) origin. */
function validateOllamaBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('The Ollama base URL is not a valid URL. Fix it in Settings → Integrations.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The Ollama base URL must start with http:// or https://.')
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

/** One leading system message, then strictly alternating user/assistant turns. */
function normalizeForStrictOrder(history: ChatMessage[]): ChatMessage[] {
  const system = history.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = normalizeTurns(history.filter((m) => m.role !== 'system'))
  if (!system) return turns
  const head = turns[0] ?? history[0]
  return [{ ...head, role: 'system', content: system, attachments: [] }, ...turns]
}

interface OpenAITextPart { type: 'text'; text: string }
interface OpenAIImagePart { type: 'image_url'; image_url: { url: string } }
type OpenAIContentPart = OpenAITextPart | OpenAIImagePart

async function buildOpenAIMessages(opts: StreamChatOptions, history: ChatMessage[]) {
  const messages: Array<{ role: string; content: OpenAIContentPart[] | string }> = []
  for (const msg of history) {
    if (msg.role === 'system') {
      messages.push({ role: 'system', content: msg.content })
      continue
    }
    if (msg.role === 'assistant') {
      messages.push({ role: 'assistant', content: assistantText(msg) })
      continue
    }
    if (!msg.attachments?.length) {
      messages.push({ role: msg.role, content: msg.content })
      continue
    }
    const expanded = await expandAttachments(opts.userId, msg.attachments)
    const parts: OpenAIContentPart[] = []
    let textBody = msg.content
    for (const e of expanded) {
      if (e.kind === 'image' && !e.missing) {
        parts.push({ type: 'image_url', image_url: { url: `data:${e.attachment.mime};base64,${e.base64}` } })
      } else {
        textBody = appendTextAttachment(textBody, e)
      }
    }
    parts.unshift({ type: 'text', text: textBody })
    messages.push({ role: 'user', content: parts })
  }
  return messages
}

async function* streamOpenAI(
  opts: StreamChatOptions,
  baseURL: string,
  { sendAuth = true, reflectErrorBody = true, normalize = false } = {}
): AsyncGenerator<string, ToolCall[]> {
  const history = normalize ? normalizeForStrictOrder(opts.history) : opts.history
  const messages = await buildOpenAIMessages(opts, history)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sendAuth) headers.Authorization = `Bearer ${opts.apiKey}`
  const tools = [
    { type: 'function', function: { name: IMAGE_TOOL_NAME, description: IMAGE_TOOL_DESCRIPTION, parameters: IMAGE_TOOL_PARAMETERS } },
  ]
  const post = (withTools: boolean) =>
    fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: opts.model, messages, stream: true, ...(withTools ? { tools } : {}) }),
      signal: opts.signal,
    })

  let res = await post(!!opts.imageTool)
  if (!res.ok || !res.body) {
    const body = await safeReadText(res)
    // Not every model behind a compatible API takes tools (an OpenRouter or
    // Ollama model without tool support rejects the request). Answer without
    // the image tool rather than failing the whole reply.
    if (opts.imageTool && res.status >= 400 && res.status < 500 && /tool|function/i.test(body ?? '')) {
      res = await post(false)
      if (!res.ok || !res.body) throw new Error(failureMessage(res.status, reflectErrorBody ? await safeReadText(res) : null))
    } else {
      throw new Error(failureMessage(res.status, reflectErrorBody ? body : null))
    }
  }

  // Tool calls stream in fragments keyed by index: the name once, the JSON
  // arguments in pieces.
  const calls = new Map<number, { name: string; args: string }>()
  yield* parseSSEDeltas(res.body, (json) => {
    const delta = json.choices?.[0]?.delta
    for (const tc of delta?.tool_calls ?? []) {
      const i = typeof tc.index === 'number' ? tc.index : calls.size
      const call = calls.get(i) ?? { name: '', args: '' }
      if (tc.function?.name && !call.name) call.name = tc.function.name
      if (typeof tc.function?.arguments === 'string') call.args += tc.function.arguments
      calls.set(i, call)
    }
    return delta?.content ?? ''
  })
  return [...calls.values()].filter((c) => c.name).map((c) => ({ name: c.name, args: parseToolArgs(c.args) }))
}

async function* streamAnthropic(opts: StreamChatOptions): AsyncGenerator<string, ToolCall[]> {
  // Extract system messages, Anthropic uses a separate `system` field.
  const systemBlocks = opts.history.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = normalizeTurns(opts.history.filter((m) => m.role !== 'system'))

  type AnthropicTextBlock = { type: 'text'; text: string }
  type AnthropicImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  type AnthropicBlock = AnthropicTextBlock | AnthropicImageBlock

  const messages: Array<{ role: 'user' | 'assistant'; content: AnthropicBlock[] | string }> = []

  for (const msg of turns) {
    if (msg.role === 'assistant') {
      messages.push({ role: 'assistant', content: assistantText(msg) })
      continue
    }
    if (!msg.attachments?.length) {
      messages.push({ role: msg.role as 'user', content: msg.content })
      continue
    }
    const expanded = await expandAttachments(opts.userId, msg.attachments)
    const blocks: AnthropicBlock[] = []
    let textBody = msg.content
    for (const e of expanded) {
      if (e.kind === 'image' && !e.missing) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: e.attachment.mime, data: e.base64! },
        })
      } else {
        textBody = appendTextAttachment(textBody, e)
      }
    }
    blocks.unshift({ type: 'text', text: textBody })
    messages.push({ role: 'user', content: blocks })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4096,
      stream: true,
      system: systemBlocks || undefined,
      messages,
      ...(opts.imageTool
        ? { tools: [{ name: IMAGE_TOOL_NAME, description: IMAGE_TOOL_DESCRIPTION, input_schema: IMAGE_TOOL_PARAMETERS }] }
        : {}),
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(failureMessage(res.status, await safeReadText(res)))
  }

  // tool_use blocks open with their name; their input arrives as JSON pieces.
  const calls = new Map<number, { name: string; args: string }>()
  yield* parseSSEDeltas(res.body, (json) => {
    if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
      calls.set(json.index, { name: json.content_block.name ?? '', args: '' })
      return ''
    }
    if (json.type === 'content_block_delta') {
      if (json.delta?.type === 'text_delta') return json.delta.text ?? ''
      const call = calls.get(json.index)
      if (call && json.delta?.type === 'input_json_delta') call.args += json.delta.partial_json ?? ''
    }
    return ''
  })
  return [...calls.values()].filter((c) => c.name).map((c) => ({ name: c.name, args: parseToolArgs(c.args) }))
}

async function* streamGemini(opts: StreamChatOptions): AsyncGenerator<string, ToolCall[]> {
  type GeminiInlinePart = { inlineData: { mimeType: string; data: string } }
  type GeminiTextPart = { text: string }
  type GeminiPart = GeminiTextPart | GeminiInlinePart

  const systemBlocks = opts.history.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = normalizeTurns(opts.history.filter((m) => m.role !== 'system'))

  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = []
  for (const msg of turns) {
    if (msg.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: assistantText(msg) }] })
      continue
    }
    if (!msg.attachments?.length) {
      contents.push({ role: 'user', parts: [{ text: msg.content }] })
      continue
    }
    const expanded = await expandAttachments(opts.userId, msg.attachments)
    const parts: GeminiPart[] = [{ text: msg.content }]
    for (const e of expanded) {
      if (e.kind === 'image' && !e.missing) {
        parts.push({ inlineData: { mimeType: e.attachment.mime, data: e.base64! } })
      } else {
        parts.push({ text: appendTextAttachment('', e) })
      }
    }
    contents.push({ role: 'user', parts })
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemBlocks ? { parts: [{ text: systemBlocks }] } : undefined,
      ...(opts.imageTool
        ? {
            tools: [
              {
                functionDeclarations: [
                  { name: IMAGE_TOOL_NAME, description: IMAGE_TOOL_DESCRIPTION, parameters: IMAGE_TOOL_PARAMETERS },
                ],
              },
            ],
          }
        : {}),
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(failureMessage(res.status, await safeReadText(res)))
  }

  // Gemini sends each function call whole, in a part of its own.
  const calls: ToolCall[] = []
  yield* parseSSEDeltas(res.body, (json) => {
    const parts = json.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ''
    let text = ''
    for (const p of parts as Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }>) {
      if (p.functionCall?.name) {
        const args = p.functionCall.args
        calls.push({
          name: p.functionCall.name,
          args: args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {},
        })
      }
      text += p.text ?? ''
    }
    return text
  })
  return calls
}

// ─── SSE helpers ───────────────────────────────────────────────────────

// `unknown` here keeps providers free to peek at whatever shape their SSE
// frames carry without us having to model the full schema.
async function* parseSSEDeltas(
  body: ReadableStream<Uint8Array>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pick: (json: any) => string
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const emit = function* (line: string): Generator<string> {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data:')) return
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const piece = pick(JSON.parse(data))
      if (piece) yield piece
    } catch {
      // Ignore malformed lines — providers occasionally emit keep-alives.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      const t = line.trim()
      if (t.startsWith('data:') && t.slice(5).trim() === '[DONE]') return
      yield* emit(line)
    }
  }

  // Flush any trailing bytes and a final line that lacked a newline.
  buffer += decoder.decode()
  yield* emit(buffer)
}

async function safeReadText(res: Response): Promise<string | null> {
  try {
    return await res.text()
  } catch {
    return null
  }
}

/** Error text for a failed provider request; `body` null hides the response. */
function failureMessage(status: number, body: string | null): string {
  return body === null ? `Provider request failed (${status})` : `Provider request failed (${status}): ${body.slice(0, 500)}`
}
