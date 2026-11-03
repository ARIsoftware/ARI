/**
 * One assistant reply: stream the model's text, then run any image-tool calls
 * it made — generate each image, store it, and hand it to the reply stream as
 * an attachment. Storage is injected so this stays free of DB code.
 */

import { IMAGE_TOOL_NAME, streamChat, type StreamChatOptions } from './providers'
import { generateImage, type GeneratedImage, type ImageProvider } from './image-gen'
import type { ReplyChunk } from './reply-stream'
import type { ChatAttachment } from '../types'

/** Caps cost and wait when a model asks for a batch of images. */
export const MAX_IMAGES_PER_REPLY = 2

export interface ImageConfig {
  provider: ImageProvider
  apiKey: string
  model: string
}

export interface GenerateReplyOptions extends StreamChatOptions {
  /** Where images are made; null leaves the image tool off. */
  image: ImageConfig | null
  /** Stores a generated image and returns it as a message attachment. */
  saveImage: (image: GeneratedImage, prompt: string) => Promise<ChatAttachment>
}

export async function* generateReply(opts: GenerateReplyOptions): AsyncGenerator<ReplyChunk> {
  const { image, saveImage, ...chat } = opts
  const calls = yield* streamChat({ ...chat, imageTool: !!image })
  if (!image) return

  const prompts = calls
    .filter((c) => c.name === IMAGE_TOOL_NAME)
    .map((c) => (typeof c.args.prompt === 'string' ? c.args.prompt.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_IMAGES_PER_REPLY)

  for (const prompt of prompts) {
    yield { type: 'status', text: 'Generating image…' }
    const generated = await generateImage({ ...image, prompt, signal: opts.signal })
    yield { type: 'attachment', attachment: await saveImage(generated, prompt) }
  }
}
