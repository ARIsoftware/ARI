/**
 * Morning Brief Module - Read aloud (ElevenLabs text-to-speech)
 *
 * POST /api/modules/morning-brief/tts - Convert the supplied brief text to
 * speech with ElevenLabs and stream the MP3 back to the browser.
 *
 * - The API key + model come from the integrations module (Settings → AI
 *   Providers), resolved via getProviderCredentials('elevenlabs').
 * - The voice is the user's saved `elevenLabsVoiceId` (Morning Brief settings),
 *   falling back to a built-in premade voice when unset.
 * - The response body is the raw audio stream (audio/mpeg); the client plays it
 *   via an Object URL. Nothing is persisted to disk.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { getProviderCredentials } from '@/modules/morning-brief/lib/provider-keys'
import { describeElevenLabsError } from '@/modules/morning-brief/lib/elevenlabs'
import { TtsRequestSchema } from '@/modules/morning-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const MODULE_ID = 'morning-brief'
// ElevenLabs "Rachel" — a stable premade voice, used until the user picks one.
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

registry.registerPath({
  method: 'post',
  path: '/api/modules/morning-brief/tts',
  operationId: 'readMorningBriefAloud',
  summary: 'Convert brief text to speech via ElevenLabs and stream the MP3 back',
  tags: ['morning-brief'],
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

    // Read the module's settings first: it carries both the chosen voice and any
    // per-module ElevenLabs model override (explicit user_id filter — see settings route).
    const rows = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
        .limit(1)
    )
    const saved = (rows[0]?.settings ?? {}) as Record<string, unknown>
    const modelOverride = (saved.aiProviderModels as Record<string, string> | undefined)?.elevenlabs

    const { apiKey, model } = await getProviderCredentials(user.id, 'elevenlabs', modelOverride)
    if (!apiKey) {
      return createErrorResponse(
        'ElevenLabs API key not configured. Add it under Settings → AI Providers.',
        400,
      )
    }

    const voiceId =
      typeof saved.elevenLabsVoiceId === 'string' && saved.elevenLabsVoiceId.length > 0
        ? saved.elevenLabsVoiceId
        : DEFAULT_VOICE_ID

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey.trim(),
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text: validation.data.text, model_id: model }),
      },
    )

    if (!upstream.ok || !upstream.body) {
      const raw = await upstream.text().catch(() => '')
      console.error('morning-brief tts upstream error:', upstream.status, raw.slice(0, 300))
      return createErrorResponse(describeElevenLabsError(upstream.status, raw), 502)
    }

    // Stream the audio straight through — no buffering, no disk writes.
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('POST /api/modules/morning-brief/tts error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
