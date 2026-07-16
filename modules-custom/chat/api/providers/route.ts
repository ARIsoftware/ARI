import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { ProvidersResponseSchema } from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { listProviderAvailability } from '@/modules/chat/lib/providers'
import { PROVIDER_LABELS } from '@/modules/chat/lib/utils'

registry.registerPath({
  method: 'get',
  path: '/api/modules/chat/providers',
  operationId: 'listChatProviders',
  summary: 'List LLM providers and whether each has an API key configured. Never reveals key values.',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Provider status list', content: { 'application/json': { schema: ProvidersResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return createErrorResponse('Unauthorized', 401)

    const availability = await listProviderAvailability(user.id)
    const providers = availability.map((a) => ({
      id: a.provider,
      name: PROVIDER_LABELS[a.provider],
      configured: a.configured,
      defaultModel: a.defaultModel,
      configuredModel: a.configuredModel,
    }))

    return NextResponse.json({ providers })
  } catch (error) {
    console.error('GET /api/modules/chat/providers error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
