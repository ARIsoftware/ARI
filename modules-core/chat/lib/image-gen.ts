/**
 * Image generation for Chat's `generate_image` tool.
 *
 * One `generateImage()` over the four providers that can make images, using
 * plain `fetch` (no SDKs). Each returns raw bytes; the MIME type is sniffed
 * from the bytes rather than trusted from the provider, since it is what the
 * file is stored and served as.
 */

import type { ChatProvider } from '../types'

export type ImageProvider = 'openai' | 'gemini' | 'xai' | 'openrouter'

/** Image-capable providers, in the order the fallback picks them. */
export const IMAGE_PROVIDERS: readonly ImageProvider[] = ['openai', 'gemini', 'xai', 'openrouter']

export const DEFAULT_IMAGE_MODELS: Record<ImageProvider, string> = {
  openai: 'gpt-image-1',
  gemini: 'gemini-2.5-flash-image',
  xai: 'grok-2-image',
  openrouter: 'google/gemini-2.5-flash-image',
}

/** Image generation is slow; give up after this long. */
export const IMAGE_TIMEOUT_MS = 120_000

export interface GeneratedImage {
  mime: string
  data: Buffer
}

export interface GenerateImageOptions {
  provider: ImageProvider
  apiKey: string
  model: string
  prompt: string
  signal?: AbortSignal
}

export function isImageProvider(id: string): id is ImageProvider {
  return (IMAGE_PROVIDERS as readonly string[]).includes(id)
}

/**
 * The image provider for a chat: the chat's own provider when it can make
 * images and has a key, otherwise the first configured one. Null when none is
 * configured — the chat then isn't offered the image tool at all.
 */
export function pickImageProvider(
  chatProvider: ChatProvider,
  isConfigured: (provider: ImageProvider) => boolean
): ImageProvider | null {
  if (isImageProvider(chatProvider) && isConfigured(chatProvider)) return chatProvider
  return IMAGE_PROVIDERS.find(isConfigured) ?? null
}

/** MIME type from the file's magic bytes; null when it isn't a known image. */
export function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (data.length >= 6 && /^GIF8[79]a$/.test(data.toString('ascii', 0, 6))) return 'image/gif'
  return null
}

function toImage(base64: string | undefined, providerName: string): GeneratedImage {
  if (!base64) throw new Error(`${providerName} did not return an image.`)
  const data = Buffer.from(base64, 'base64')
  const mime = sniffImageMime(data)
  if (!mime) throw new Error(`${providerName} returned something that isn't an image.`)
  return { mime, data }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(IMAGE_TIMEOUT_MS)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 500)
    } catch {
      // unreadable body — the status alone will do.
    }
    throw new Error(`Image generation failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider-specific JSON shapes
  return (await res.json()) as any
}

export async function generateImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const { apiKey, model, prompt, signal } = opts
  switch (opts.provider) {
    case 'openai': {
      // gpt-image models always answer with base64.
      const json = await postJson(
        'https://api.openai.com/v1/images/generations',
        { Authorization: `Bearer ${apiKey}` },
        { model, prompt, n: 1, size: '1024x1024' },
        signal
      )
      return toImage(json?.data?.[0]?.b64_json, 'OpenAI')
    }
    case 'xai': {
      const json = await postJson(
        'https://api.x.ai/v1/images/generations',
        { Authorization: `Bearer ${apiKey}` },
        { model, prompt, n: 1, response_format: 'b64_json' },
        signal
      )
      return toImage(json?.data?.[0]?.b64_json, 'xAI')
    }
    case 'gemini': {
      const json = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': apiKey },
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        },
        signal
      )
      const parts: Array<{ inlineData?: { data?: string } }> = json?.candidates?.[0]?.content?.parts ?? []
      return toImage(parts.find((p) => p.inlineData?.data)?.inlineData?.data, 'Gemini')
    }
    case 'openrouter': {
      const json = await postJson(
        'https://openrouter.ai/api/v1/chat/completions',
        { Authorization: `Bearer ${apiKey}` },
        { model, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'] },
        signal
      )
      const url: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url
      const base64 = url?.match(/^data:[^;]+;base64,(.+)$/)?.[1]
      return toImage(base64, 'OpenRouter')
    }
  }
}
