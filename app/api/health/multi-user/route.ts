import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkMultiUser } from '@/lib/health/checks'
import { HealthMultiUserSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

export const debugRole = "health-multi-user"

registry.registerPath({
  method: 'get',
  path: '/api/health/multi-user',
  operationId: 'getHealthMultiUser',
  summary: 'Multi-user setup diagnostics: the role/permissions/disabled columns are present and at least one active admin exists',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Multi-user setup status', content: { 'application/json': { schema: HealthMultiUserSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

/**
 * GET /api/health/multi-user
 * Verifies two app-layer invariants the multi-user system depends on:
 *  1. the user table has the role / permissions / disabled columns (a
 *     half-applied migration silently degrades getAuthenticatedUser), and
 *  2. at least one active (non-disabled) admin exists — without one, nobody
 *     can manage users and the install is unmanageable.
 */
export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  try {
    const result = await checkMultiUser()
    // null means no pool is configured — distinct from "checks ran and failed".
    if (!result) return NextResponse.json({ error: 'Database not available' }, { status: 500 })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check multi-user setup' },
      { status: 500 }
    )
  }
}
