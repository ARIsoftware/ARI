/**
 * Tests for modules-core/chat/lib/image-gen.ts — provider pick, MIME sniffing,
 * and each provider's image request/response shape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  DEFAULT_IMAGE_MODELS,
  IMAGE_PROVIDERS,
  generateImage,
  isImageProvider,
  pickImageProvider,
  sniffImageMime,
} from '@/modules-core/chat/lib/image-gen'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
const GIF = Buffer.from('GIF89a....')
const b64 = (b: Buffer) => b.toString('base64')

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function mockFetch(res: Response) {
  const fn = vi.fn().mockResolvedValue(res)
  vi.stubGlobal('fetch', fn)
  return fn
}

function call(fn: ReturnType<typeof vi.fn>) {
  const [url, init] = fn.mock.calls[0] as [string, RequestInit]
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)), signal: init.signal }
}

afterEach(() => vi.unstubAllGlobals())

describe('isImageProvider / pickImageProvider', () => {
  it('knows the image-capable providers', () => {
    expect(IMAGE_PROVIDERS).toEqual(['openai', 'gemini', 'xai', 'openrouter'])
    expect(isImageProvider('gemini')).toBe(true)
    expect(isImageProvider('anthropic')).toBe(false)
  })

  it("prefers the chat's own provider when it can make images and has a key", () => {
    expect(pickImageProvider('xai', () => true)).toBe('xai')
  })

  it('falls back to the first configured image provider', () => {
    expect(pickImageProvider('anthropic', (p) => p === 'gemini' || p === 'openrouter')).toBe('gemini')
    expect(pickImageProvider('xai', (p) => p === 'openrouter')).toBe('openrouter')
  })

  it('returns null when no image provider has a key', () => {
    expect(pickImageProvider('anthropic', () => false)).toBeNull()
  })
})

describe('sniffImageMime', () => {
  it('recognises png, jpeg, webp and gif', () => {
    expect(sniffImageMime(PNG)).toBe('image/png')
    expect(sniffImageMime(JPEG)).toBe('image/jpeg')
    expect(sniffImageMime(WEBP)).toBe('image/webp')
    expect(sniffImageMime(GIF)).toBe('image/gif')
  })

  it('returns null for anything else', () => {
    expect(sniffImageMime(Buffer.from('<html>'))).toBeNull()
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull()
  })
})

describe('generateImage', () => {
  const base = { apiKey: 'k', prompt: 'a red fox' }

  it('openai: posts to /v1/images and decodes b64_json', async () => {
    const fn = mockFetch(okJson({ data: [{ b64_json: b64(PNG) }] }))
    const img = await generateImage({ ...base, provider: 'openai', model: DEFAULT_IMAGE_MODELS.openai })
    expect(img).toEqual({ mime: 'image/png', data: PNG })
    const c = call(fn)
    expect(c.url).toBe('https://api.openai.com/v1/images/generations')
    expect(c.headers.Authorization).toBe('Bearer k')
    expect(c.body).toEqual({ model: 'gpt-image-1', prompt: 'a red fox', n: 1, size: '1024x1024' })
  })

  it('xai: asks for base64 and sniffs the jpeg it returns', async () => {
    const fn = mockFetch(okJson({ data: [{ b64_json: b64(JPEG) }] }))
    const img = await generateImage({ ...base, provider: 'xai', model: 'grok-2-image' })
    expect(img.mime).toBe('image/jpeg')
    const c = call(fn)
    expect(c.url).toBe('https://api.x.ai/v1/images/generations')
    expect(c.body.response_format).toBe('b64_json')
  })

  it('gemini: sends the key as a header and reads the inline image part', async () => {
    const fn = mockFetch(
      okJson({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: b64(PNG) } }] } }] })
    )
    const img = await generateImage({ ...base, provider: 'gemini', model: 'gemini 2.5/image' })
    expect(img.mime).toBe('image/png')
    const c = call(fn)
    expect(c.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini%202.5%2Fimage:generateContent'
    )
    expect(c.headers['x-goog-api-key']).toBe('k')
    expect(c.body.generationConfig).toEqual({ responseModalities: ['IMAGE', 'TEXT'] })
  })

  it('openrouter: asks for image output and decodes the data URL', async () => {
    const fn = mockFetch(
      okJson({ choices: [{ message: { images: [{ image_url: { url: `data:image/webp;base64,${b64(WEBP)}` } }] } }] })
    )
    const img = await generateImage({ ...base, provider: 'openrouter', model: 'google/x' })
    expect(img.mime).toBe('image/webp')
    expect(call(fn).body.modalities).toEqual(['image', 'text'])
  })

  it('combines the caller signal with its own timeout', async () => {
    const fn = mockFetch(okJson({ data: [{ b64_json: b64(PNG) }] }))
    const controller = new AbortController()
    await generateImage({ ...base, provider: 'openai', model: 'm', signal: controller.signal })
    const { signal } = call(fn)
    expect(signal).toBeInstanceOf(AbortSignal)
    controller.abort()
    expect(signal!.aborted).toBe(true)
  })

  it.each([
    ['openai', {}, 'OpenAI did not return an image.'],
    ['xai', { data: [] }, 'xAI did not return an image.'],
    ['gemini', { candidates: [{ content: { parts: [{ text: 'no' }] } }] }, 'Gemini did not return an image.'],
    ['gemini', {}, 'Gemini did not return an image.'],
    ['openrouter', { choices: [{ message: { images: [{ image_url: { url: 'https://x/y.png' } }] } }] }, 'OpenRouter did not return an image.'],
    ['openrouter', {}, 'OpenRouter did not return an image.'],
  ] as const)('%s: errors when no image comes back', async (provider, body, message) => {
    mockFetch(okJson(body))
    await expect(generateImage({ ...base, provider, model: 'm' })).rejects.toThrow(message)
  })

  it('rejects bytes that are not an image', async () => {
    mockFetch(okJson({ data: [{ b64_json: b64(Buffer.from('<html>nope</html>')) }] }))
    await expect(generateImage({ ...base, provider: 'openai', model: 'm' })).rejects.toThrow(
      "OpenAI returned something that isn't an image."
    )
  })

  it('reports the status and a truncated body on failure', async () => {
    mockFetch({ ok: false, status: 400, text: async () => 'x'.repeat(600) } as unknown as Response)
    await expect(generateImage({ ...base, provider: 'openai', model: 'm' })).rejects.toThrow(
      `Image generation failed (400): ${'x'.repeat(500)}`
    )
  })

  it('reports just the status when the error body is unreadable or empty', async () => {
    mockFetch({ ok: false, status: 500, text: async () => { throw new Error('gone') } } as unknown as Response)
    await expect(generateImage({ ...base, provider: 'xai', model: 'm' })).rejects.toThrow(/^Image generation failed \(500\)$/)
    mockFetch({ ok: false, status: 403, text: async () => '' } as unknown as Response)
    await expect(generateImage({ ...base, provider: 'xai', model: 'm' })).rejects.toThrow(/^Image generation failed \(403\)$/)
  })
})
