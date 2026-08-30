/**
 * Health endpoint to verify RLS policies are actually enforcing row isolation.
 *
 * The test itself lives in `lib/health/checks.ts` (`runRlsTest`) so the
 * aggregate /api/health/full scan runs the identical logic.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { runRlsTest } from '@/lib/health/checks'
import { safeErrorResponse } from '@/lib/api-error'
import { HealthRlsTestSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, UnauthorizedResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

export const debugRole = "health-rls-test"

registry.registerPath({
  method: 'post',
  path: '/api/health/rls-test',
  operationId: 'runHealthRlsTest',
  summary: 'End-to-end RLS isolation test using a sentinel module_settings row (positive + negative checks)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'RLS test report', content: { 'application/json': { schema: HealthRlsTestSchema } } },
    401: UnauthorizedResponse,
    500: { description: 'Test failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

// POST (not GET) because this endpoint mutates the database (INSERT/DELETE on
// module_settings). Using POST matches REST semantics and blocks trivial CSRF
// via <img>/<link> tags that only issue GET. The auth cookie's SameSite=Lax
// already blocks cross-site POSTs, so this gives defense in depth.
async function handlePOST() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({
        authenticated: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    return NextResponse.json(await runRlsTest(user.id, withRLS))
  } catch (error: unknown) {
    console.error('[Debug RLS] Test failed:', error)
    return NextResponse.json({
      error: safeErrorResponse(error)
    }, { status: 500 })
  }
}

export const POST = withApiLogging(handlePOST)
