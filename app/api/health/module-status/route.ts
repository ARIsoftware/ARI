/**
 * Health endpoint to check module status
 *
 * Returns detailed information about why modules might not be loading
 * Used by /health page to diagnose module issues
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkModuleStatus } from '@/lib/health/checks'
import { safeErrorResponse } from '@/lib/api-error'
import { HealthModuleStatusSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

export const debugRole = "health-module-status"

registry.registerPath({
  method: 'get',
  path: '/api/health/module-status',
  operationId: 'getHealthModuleStatus',
  summary: 'Diagnostic snapshot of module discovery + per-user enable state',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: 'Module status report (returns { authenticated: false } if the request reaches the handler without auth — middleware normally blocks first with 401)',
      content: { 'application/json': { schema: HealthModuleStatusSchema } },
    },
    401: { description: 'Unauthorized (returned by middleware when no session/API key)', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({
        error: 'No authenticated user',
        authenticated: false
      })
    }

    return NextResponse.json(await checkModuleStatus(user.id, withRLS))
  } catch (error: unknown) {
    console.error('[Debug] Module status error:', error)
    return NextResponse.json({
      error: safeErrorResponse(error)
    }, { status: 500 })
  }
}
