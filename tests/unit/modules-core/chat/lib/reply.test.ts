/**
 * Tests for modules-core/chat/lib/reply.ts — text passes through, image-tool
 * calls are generated, saved and yielded as attachments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/modules-core/chat/lib/providers', () => ({
  IMAGE_TOOL_NAME: 'generate_image',
  streamChat: vi.fn(),
}))
vi.mock('@/modules-core/chat/lib/image-gen', () => ({
  generateImage: vi.fn(),
}))

import { streamChat, type ToolCall } from '@/modules-core/chat/lib/providers'
import { generateImage } from '@/modules-core/chat/lib/image-gen'
import { generateReply, MAX_IMAGES_PER_REPLY, type GenerateReplyOptions } from '@/modules-core/chat/lib/reply'
import type { ReplyChunk } from '@/modules-core/chat/lib/reply-stream'
import type { ChatAttachment } from '@/modules-core/chat/types'

const mockStreamChat = vi.mocked(streamChat)
const mockGenerateImage = vi.mocked(generateImage)

function modelReply(text: string[], calls: ToolCall[]) {
  mockStreamChat.mockImplementation(async function* () {
    for (const t of text) yield t
    return calls
  })
}

const IMAGE = { provider: 'openai' as const, apiKey: 'k', model: 'gpt-image-1' }
const att = (n: number): ChatAttachment => ({
  upload_id: `up-${n}`, filename: `f${n}.png`, original_name: `p${n}`, mime: 'image/png', size: 1, bucket: 'chat',
})

function opts(overrides: Partial<GenerateReplyOptions> = {}): GenerateReplyOptions {
  let n = 0
  return {
    userId: 'u1',
    provider: 'anthropic',
    model: 'm',
    history: [],
    apiKey: 'chat-key',
    image: IMAGE,
    saveImage: vi.fn(async () => att(++n)),
    ...overrides,
  }
}

async function collect(gen: AsyncGenerator<ReplyChunk>): Promise<ReplyChunk[]> {
  const out: ReplyChunk[] = []
  for await (const c of gen) out.push(c)
  return out
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGenerateImage.mockResolvedValue({ mime: 'image/png', data: Buffer.from('x') })
})

describe('generateReply', () => {
  it('passes text through and offers the tool when an image provider exists', async () => {
    modelReply(['Hi', ' there'], [])
    const o = opts()
    expect(await collect(generateReply(o))).toEqual(['Hi', ' there'])
    const passed = mockStreamChat.mock.calls[0][0]
    expect(passed.imageTool).toBe(true)
    expect(passed).not.toHaveProperty('image')
    expect(passed).not.toHaveProperty('saveImage')
  })

  it('generates, saves and yields each requested image', async () => {
    modelReply(['Sure.'], [{ name: 'generate_image', args: { prompt: '  a fox  ' } }])
    const o = opts()
    const out = await collect(generateReply(o))
    expect(out).toEqual(['Sure.', { type: 'status', text: 'Generating image…' }, { type: 'attachment', attachment: att(1) }])
    expect(mockGenerateImage).toHaveBeenCalledWith({ ...IMAGE, prompt: 'a fox', signal: undefined })
    expect(o.saveImage).toHaveBeenCalledWith({ mime: 'image/png', data: Buffer.from('x') }, 'a fox')
  })

  it('ignores other tools and empty or non-string prompts, and caps the batch', async () => {
    modelReply([], [
      { name: 'web_search', args: { prompt: 'x' } },
      { name: 'generate_image', args: { prompt: '' } },
      { name: 'generate_image', args: { prompt: 42 } },
      { name: 'generate_image', args: { prompt: 'one' } },
      { name: 'generate_image', args: { prompt: 'two' } },
      { name: 'generate_image', args: { prompt: 'three' } },
    ])
    await collect(generateReply(opts()))
    expect(mockGenerateImage).toHaveBeenCalledTimes(MAX_IMAGES_PER_REPLY)
    expect(mockGenerateImage.mock.calls.map((c) => c[0].prompt)).toEqual(['one', 'two'])
  })

  it('leaves the tool off and generates nothing without an image provider', async () => {
    modelReply(['ok'], [{ name: 'generate_image', args: { prompt: 'a fox' } }])
    expect(await collect(generateReply(opts({ image: null })))).toEqual(['ok'])
    expect(mockStreamChat.mock.calls[0][0].imageTool).toBe(false)
    expect(mockGenerateImage).not.toHaveBeenCalled()
  })

  it('lets an image failure propagate', async () => {
    modelReply([], [{ name: 'generate_image', args: { prompt: 'a fox' } }])
    mockGenerateImage.mockRejectedValue(new Error('Image generation failed (400)'))
    await expect(collect(generateReply(opts()))).rejects.toThrow('Image generation failed (400)')
  })
})
