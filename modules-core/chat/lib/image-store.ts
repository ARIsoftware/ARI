/**
 * Stores a generated image the same way a user upload is stored — a file in
 * the chat bucket plus a `chat_uploads` row — so it is served, listed and
 * cleaned up like any other chat file.
 */

import { getStorageProvider, readStorageConfig } from '@/lib/storage'
import { chatUploads } from '@/lib/db/schema'
import type { DrizzleDb } from '@/lib/db'
import { CHAT_BUCKET } from './utils'
import type { GeneratedImage } from './image-gen'
import type { ChatAttachment } from '../types'

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** The prompt doubles as the image's name (and alt text): keep it renderable. */
export function imageNameFromPrompt(prompt: string): string {
  return prompt.replace(/[<>\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Generated image'
}

export interface SaveGeneratedImageOptions {
  userId: string
  conversationId: string
  withRLS: <T>(operation: (db: DrizzleDb) => Promise<T>) => Promise<T>
  image: GeneratedImage
  prompt: string
}

export async function saveGeneratedImage(opts: SaveGeneratedImageOptions): Promise<ChatAttachment> {
  const { userId, conversationId, image } = opts
  const storage = getStorageProvider(readStorageConfig())
  const result = await storage.upload(
    userId,
    CHAT_BUCKET,
    `generated-image.${EXTENSIONS[image.mime] ?? 'png'}`,
    image.data,
    image.mime
  )
  const [row] = await opts.withRLS((db) =>
    db
      .insert(chatUploads)
      .values({
        userId,
        conversationId,
        filename: result.name,
        originalName: imageNameFromPrompt(opts.prompt),
        mime: image.mime,
        size: image.data.length,
        bucket: CHAT_BUCKET,
      })
      .returning()
  )
  return {
    upload_id: row.id,
    filename: row.filename,
    original_name: row.originalName,
    mime: row.mime,
    size: row.size,
    bucket: row.bucket,
  }
}
