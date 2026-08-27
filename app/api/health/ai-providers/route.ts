import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkAiProviders } from '@/lib/health/checks'
import { HealthAiProvidersSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

export const debugRole = "health-ai-providers"

registry.registerPath({
  method: 'get',
  path: '/api/health/ai-providers',
  operationId: 'getHealthAiProviders',
  summary: 'Per-provider AI key configuration status (env vs saved), no secrets exposed',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'AI provider configuration status', content: { 'application/json': { schema: HealthAiProvidersSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

/**
 * GET /api/health/ai-providers
 * Reports, per provider, whether a primary key is configured and where it comes
 * from (`env` takes precedence over a `db`-saved value). Never returns secrets.
 */
export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    return NextResponse.json(await checkAiProviders(withRLS))
  } catch {
    return NextResponse.json({ error: 'Failed to check AI providers' }, { status: 500 })
  }
}
