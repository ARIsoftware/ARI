/**
 * LLM provider abstraction for the Chat module.
 *
 * Reads API keys from the same encrypted store used by Settings → Integrations
 * (`module_settings` row with `module_id = 'integrations'`), with `process.env`
 * fallback. Exposes a unified `streamChat()` that emits text deltas across
 * OpenAI, Anthropic, Gemini, and OpenRouter.
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
import { chatProviderMeta } from './utils'
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

export interface ProviderAvailability {
  provider: ChatProvider
  configured: boolean
  configuredModel: string | null
  defaultModel: string
}

export async function listProviderAvailability(userId: string): Promise<ProviderAvailability[]> {
  const saved = await readIntegrationSettings(userId)
  const providers: ChatProvider[] = ['openai', 'anthropic', 'gemini', 'openrouter']
  return providers.map((provider) => {
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
}

export async function* streamChat(opts: StreamChatOptions): AsyncGenerator<string> {
  switch (opts.provider) {
    case 'openai':
      yield* streamOpenAI(opts, 'https://api.openai.com/v1')
      return
    case 'openrouter':
      yield* streamOpenAI(opts, 'https://openrouter.ai/api/v1')
      return
    case 'anthropic':
      yield* streamAnthropic(opts)
      return
    case 'gemini':
      yield* streamGemini(opts)
      return
  }
}

interface OpenAITextPart { type: 'text'; text: string }
interface OpenAIImagePart { type: 'image_url'; image_url: { url: string } }
type OpenAIContentPart = OpenAITextPart | OpenAIImagePart

async function buildOpenAIMessages(opts: StreamChatOptions) {
  const messages: Array<{ role: string; content: OpenAIContentPart[] | string }> = []
  for (const msg of opts.history) {
    if (msg.role === 'system') {
      messages.push({ role: 'system', content: msg.content })
      continue
    }
    if (msg.role === 'assistant' || !msg.attachments?.length) {
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

async function* streamOpenAI(opts: StreamChatOptions, baseURL: string): AsyncGenerator<string> {
  const messages = await buildOpenAIMessages(opts)
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ model: opts.model, messages, stream: true }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    const errText = await safeReadError(res)
    throw new Error(errText)
  }

  yield* parseSSEDeltas(res.body, (json) => {
    return json.choices?.[0]?.delta?.content ?? ''
  })
}

async function* streamAnthropic(opts: StreamChatOptions): AsyncGenerator<string> {
  // Extract system messages, Anthropic uses a separate `system` field.
  const systemBlocks = opts.history.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = normalizeTurns(opts.history.filter((m) => m.role !== 'system'))

  type AnthropicTextBlock = { type: 'text'; text: string }
  type AnthropicImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  type AnthropicBlock = AnthropicTextBlock | AnthropicImageBlock

  const messages: Array<{ role: 'user' | 'assistant'; content: AnthropicBlock[] | string }> = []

  for (const msg of turns) {
    if (msg.role === 'assistant' || !msg.attachments?.length) {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
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
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    const errText = await safeReadError(res)
    throw new Error(errText)
  }

  yield* parseSSEDeltas(res.body, (json) => {
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return json.delta.text ?? ''
    }
    return ''
  })
}

async function* streamGemini(opts: StreamChatOptions): AsyncGenerator<string> {
  type GeminiInlinePart = { inlineData: { mimeType: string; data: string } }
  type GeminiTextPart = { text: string }
  type GeminiPart = GeminiTextPart | GeminiInlinePart

  const systemBlocks = opts.history.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = normalizeTurns(opts.history.filter((m) => m.role !== 'system'))

  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = []
  for (const msg of turns) {
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user'
    if (role === 'model' || !msg.attachments?.length) {
      contents.push({ role, parts: [{ text: msg.content }] })
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
    contents.push({ role, parts })
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemBlocks ? { parts: [{ text: systemBlocks }] } : undefined,
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    const errText = await safeReadError(res)
    throw new Error(errText)
  }

  yield* parseSSEDeltas(res.body, (json) => {
    const parts = json.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ''
    return parts.map((p: { text?: string }) => p.text ?? '').join('')
  })
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

async function safeReadError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return `Provider request failed (${res.status}): ${text.slice(0, 500)}`
  } catch {
    return `Provider request failed (${res.status})`
  }
}
