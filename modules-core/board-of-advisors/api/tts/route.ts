/**
 * Board of Advisors - Read a reply aloud (ElevenLabs text-to-speech)
 *
 * POST /api/modules/board-of-advisors/tts - Convert an advisor's reply to
 * speech with ElevenLabs and stream the MP3 back to the browser.
 *
 * - The API key + model come from the integrations module (Settings → AI
 *   Providers), resolved via getProviderCredentials('elevenlabs').
 * - The voice comes from the advisor: their explicit voice_id, else a stable
 *   sex-based pick (resolveVoiceId). If no advisorId is given (or the advisor
 *   was deleted), we fall back to a built-in premade voice.
 * - The response body is the raw audio stream (audio/mpeg); the client plays it
 *   via an Object URL. Nothing is persisted to disk.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { getProviderCredentials } from '@/modules/board-of-advisors/lib/provider-keys'
import { describeElevenLabsError } from '@/modules/board-of-advisors/lib/elevenlabs'
import { TtsRequestSchema } from '@/modules/board-of-advisors/lib/validation'
import { resolveVoiceId, DEFAULT_VOICE_ID, type AdvisorSex } from '@/modules/board-of-advisors/lib/voices'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { boardAdvisors, moduleSettings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const MODULE_ID = 'board-of-advisors'
// ElevenLabs synthesizes a bounded number of characters per request, so long
// advisor replies are split into chunks (on paragraph/sentence/word boundaries)
// and streamed back-to-back as one continuous MP3.
const MAX_TTS_CHARS = 2500

/** Split text into <= max-char pieces, preferring paragraph/sentence/word breaks. */
function chunkText(text: string, max: number): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed ? [trimmed] : []
  const chunks: string[] = []
  let rest = trimmed
  while (rest.length > max) {
    const window = rest.slice(0, max)
    let cut = window.lastIndexOf('\n')
    if (cut < max * 0.5) {
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
      cut = sentence >= max * 0.5 ? sentence + 1 : -1
    }
    if (cut < max * 0.5) {
      const space = window.lastIndexOf(' ')
      cut = space >= max * 0.5 ? space : max
    }
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

/** Synthesize one text chunk to MP3 via ElevenLabs. */
function synthesizeChunk(voiceId: string, apiKey: string, model: string, text: string): Promise<Response> {
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey.trim(),
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: model }),
    },
  )
}

const AUDIO_HEADERS = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } as const

registry.registerPath({
  method: 'post',
  path: '/api/modules/board-of-advisors/tts',
  operationId: 'readBoardReplyAloud',
  summary: "Convert an advisor's reply to speech via ElevenLabs and stream the MP3 back",
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: TtsRequestSchema } } } },
  responses: {
    200: { description: 'MP3 audio stream (audio/mpeg)' },
    400: { description: 'Validation error or ElevenLabs not configured', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    502: { description: 'ElevenLabs upstream error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, TtsRequestSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    // One round-trip for both the advisor row (which selects the voice) and this
    // module's settings (an optional per-module ElevenLabs model override).
    const advisorId = validation.data.advisorId
    const [advisorRows, settingsRows] = await withRLS((db) =>
      Promise.all([
        advisorId
          ? db
              .select({ id: boardAdvisors.id, sex: boardAdvisors.sex, voiceId: boardAdvisors.voiceId })
              .from(boardAdvisors)
              .where(and(eq(boardAdvisors.id, advisorId), eq(boardAdvisors.userId, user.id)))
              .limit(1)
          : Promise.resolve([] as { id: string; sex: string; voiceId: string | null }[]),
        db
          .select({ settings: moduleSettings.settings })
          .from(moduleSettings)
          .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
          .limit(1),
      ])
    )

    // Resolve the voice from the advisor (explicit voice_id → stable sex-based
    // pick). Unknown/deleted advisor → the built-in default voice.
    const voiceId = advisorRows[0]
      ? resolveVoiceId({ id: advisorRows[0].id, sex: advisorRows[0].sex as AdvisorSex, voice_id: advisorRows[0].voiceId })
      : DEFAULT_VOICE_ID

    const saved = (settingsRows[0]?.settings ?? {}) as Record<string, unknown>
    const modelOverride = (saved.aiProviderModels as Record<string, string> | undefined)?.elevenlabs

    const { apiKey, model } = await getProviderCredentials(user.id, 'elevenlabs', modelOverride)
    if (!apiKey) {
      return createErrorResponse(
        'ElevenLabs API key not configured. Add it under Settings → AI Providers.',
        400,
      )
    }

    const chunks = chunkText(validation.data.text, MAX_TTS_CHARS)
    if (chunks.length === 0) {
      return createErrorResponse('Nothing to read aloud.', 400)
    }

    // Synthesize the first chunk eagerly so a bad key / exhausted quota surfaces
    // as a proper error status (once we start streaming we can only send 200).
    const first = await synthesizeChunk(voiceId, apiKey, model, chunks[0])
    if (!first.ok || !first.body) {
      const raw = await first.text().catch(() => '')
      console.error('board-of-advisors tts upstream error:', first.status, raw.slice(0, 300))
      return createErrorResponse(describeElevenLabsError(first.status, raw), 502)
    }

    // Single chunk: stream straight through — no buffering, no disk writes.
    if (chunks.length === 1) {
      return new NextResponse(first.body, { status: 200, headers: AUDIO_HEADERS })
    }

    // Multiple chunks: stream the first, then fetch + append the rest in order,
    // yielding one continuous MP3.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const pump = async (body: ReadableStream<Uint8Array>) => {
          const reader = body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) controller.enqueue(value)
          }
        }
        try {
          await pump(first.body!)
          for (let i = 1; i < chunks.length; i++) {
            const next = await synthesizeChunk(voiceId, apiKey, model, chunks[i])
            if (!next.ok || !next.body) {
              const raw = await next.text().catch(() => '')
              console.error('board-of-advisors tts chunk error:', next.status, raw.slice(0, 300))
              break // best effort: deliver the audio synthesized so far
            }
            await pump(next.body)
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new NextResponse(stream, { status: 200, headers: AUDIO_HEADERS })
  } catch (error) {
    console.error('POST /api/modules/board-of-advisors/tts error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
