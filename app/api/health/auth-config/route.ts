import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkAuthConfig } from '@/lib/health/checks'
import { HealthAuthConfigSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

export const debugRole = "auth-config"

registry.registerPath({
  method: 'get',
  path: '/api/health/auth-config',
  operationId: 'getHealthAuthConfig',
  summary: 'Non-sensitive Better Auth configuration status (no secrets exposed)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Auth configuration status', content: { 'application/json': { schema: HealthAuthConfigSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

/**
 * GET /api/health/auth-config
 * Returns non-sensitive auth configuration details for debugging.
 * Does NOT expose secrets.
 */
async function handleGET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    return NextResponse.json(checkAuthConfig())
  } catch {
    return NextResponse.json({ error: 'Failed to get auth config' }, { status: 500 })
  }
}

export const GET = withApiLogging(handleGET)
