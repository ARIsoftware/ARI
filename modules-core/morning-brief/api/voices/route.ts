/**
 * Morning Brief Module - ElevenLabs voices API
 *
 * GET /api/modules/morning-brief/voices - List the ElevenLabs voices available
 * to the user's account, so the settings panel can offer a voice picker.
 *
 * The ElevenLabs API key is resolved from the integrations module (Settings →
 * AI Providers), the same way the greeting resolves its LLM key. When no key is
 * configured we return `{ configured: false, voices: [] }` so the UI can prompt
 * the user to add one instead of erroring.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getProviderCredentials } from '@/modules/morning-brief/lib/provider-keys'
import { describeElevenLabsError } from '@/modules/morning-brief/lib/elevenlabs'
import { VoicesResponseSchema } from '@/modules/morning-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/voices',
  operationId: 'listMorningBriefVoices',
  summary: 'List ElevenLabs voices available to the user (for the read-aloud picker)',
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Available voices', content: { 'application/json': { schema: VoicesResponseSchema } } },
    401: UnauthorizedResponse,
    502: { description: 'ElevenLabs upstream error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

interface ElevenLabsApiVoice {
  voice_id: string
  name: string
  category?: string | null
  preview_url?: string | null
  labels?: Record<string, string> | null
}

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const { apiKey } = await getProviderCredentials(user.id, 'elevenlabs')
    if (!apiKey) {
      // No key configured — not an error; the UI surfaces a "set it up" prompt.
      return NextResponse.json({ configured: false, voices: [] })
    }

    const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey.trim(), Accept: 'application/json' },
    })

    if (!upstream.ok) {
      const raw = await upstream.text().catch(() => '')
      console.error('morning-brief voices upstream error:', upstream.status, raw.slice(0, 300))
      return createErrorResponse(describeElevenLabsError(upstream.status, raw), 502)
    }

    const data = (await upstream.json()) as { voices?: ElevenLabsApiVoice[] }
    const voices = (Array.isArray(data?.voices) ? data.voices : []).map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category ?? null,
      previewUrl: v.preview_url ?? null,
      labels: v.labels ?? null,
    }))

    return NextResponse.json({ configured: true, voices })
  } catch (error) {
    console.error('GET /api/modules/morning-brief/voices error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
