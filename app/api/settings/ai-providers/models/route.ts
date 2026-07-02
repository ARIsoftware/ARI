import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { AI_PROVIDER_IDS, type AiProviderId } from '@/lib/ai-providers'
import { getProviderModels } from '@/lib/ai-provider-models'
import {
  settingsProviderModelsQuerySchema,
  SettingsProviderModelsSchema,
} from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/settings/ai-providers/models',
  operationId: 'listProviderModels',
  summary: "List a provider's available models (live from the provider API, cached 8h)",
  description:
    'Resolves the configured API key server-side and calls the provider\'s list-models endpoint, normalizing the result. Shared 8h cache keyed by provider. Providers without a list endpoint return source="unavailable" and the UI falls back to free-text model entry.',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { query: settingsProviderModelsQuerySchema },
  responses: {
    200: { description: 'Available models', content: { 'application/json': { schema: SettingsProviderModelsSchema } } },
    400: { description: 'Invalid provider', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return createErrorResponse('Unauthorized', 401)

    const provider = request.nextUrl.searchParams.get('provider') ?? ''
    if (!(AI_PROVIDER_IDS as readonly string[]).includes(provider)) {
      return createErrorResponse('Invalid provider', 400)
    }

    const result = await getProviderModels(user.id, provider as AiProviderId)
    return NextResponse.json({ provider, ...result })
  } catch (error) {
    console.error('ai-providers/models error:', error)
    return createErrorResponse('Failed to list models', 500)
  }
}
