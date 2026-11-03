/**
 * Tests for modules-core/chat/lib/image-store.ts — generated images are stored
 * like uploads (chat bucket file + chat_uploads row).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/storage', () => ({
  getStorageProvider: vi.fn(),
  readStorageConfig: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/schema', () => ({ chatUploads: { __table: 'chat_uploads' } }))

import { getStorageProvider } from '@/lib/storage'
import { imageNameFromPrompt, saveGeneratedImage } from '@/modules-core/chat/lib/image-store'

const upload = vi.fn()
let inserted: Record<string, unknown> | null = null

const fakeDb = {
  insert: (table: unknown) => ({
    values: (v: Record<string, unknown>) => {
      inserted = { table, ...v }
      return { returning: async () => [{ id: 'up-1', ...v }] }
    },
  }),
}
const withRLS = vi.fn(async (fn: (db: never) => Promise<unknown>) => fn(fakeDb as never)) as never

beforeEach(() => {
  vi.clearAllMocks()
  inserted = null
  upload.mockResolvedValue({ name: '123-generated-image.png', path: 'chat/123-generated-image.png' })
  vi.mocked(getStorageProvider).mockReturnValue({ upload } as never)
})

describe('imageNameFromPrompt', () => {
  it('strips markup and control characters, collapses whitespace and caps the length', () => {
    expect(imageNameFromPrompt(' a <b>red</b>\n\tfox ')).toBe('a b red /b fox')
    expect(imageNameFromPrompt('x'.repeat(300))).toHaveLength(200)
  })

  it('falls back to a generic name', () => {
    expect(imageNameFromPrompt(' <> ')).toBe('Generated image')
  })
})

describe('saveGeneratedImage', () => {
  it('uploads to the chat bucket, records the upload, and returns the attachment', async () => {
    const data = Buffer.from('jpegbytes')
    const att = await saveGeneratedImage({
      userId: 'u1',
      conversationId: 'c1',
      withRLS,
      image: { mime: 'image/jpeg', data },
      prompt: 'a fox',
    })
    expect(upload).toHaveBeenCalledWith('u1', 'chat', 'generated-image.jpg', data, 'image/jpeg')
    expect(inserted).toMatchObject({
      table: { __table: 'chat_uploads' },
      userId: 'u1',
      conversationId: 'c1',
      filename: '123-generated-image.png',
      originalName: 'a fox',
      mime: 'image/jpeg',
      size: data.length,
      bucket: 'chat',
    })
    expect(att).toEqual({
      upload_id: 'up-1',
      filename: '123-generated-image.png',
      original_name: 'a fox',
      mime: 'image/jpeg',
      size: data.length,
      bucket: 'chat',
    })
  })

  it('names unknown types .png', async () => {
    await saveGeneratedImage({
      userId: 'u1',
      conversationId: 'c1',
      withRLS,
      image: { mime: 'image/avif', data: Buffer.from('x') },
      prompt: 'p',
    })
    expect(upload.mock.calls[0][2]).toBe('generated-image.png')
  })
})
