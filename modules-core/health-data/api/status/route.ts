/**
 * Health Data - Status API
 *
 * GET /api/modules/health-data/status
 *
 * Returns the user's current import (processing, completed, or failed),
 * or null when nothing is loaded. Purges expired data as a side effect,
 * so simply polling this endpoint enforces the 1-hour retention.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { StatusResponseSchema } from '@/modules/health-data/lib/validation'
import { getCurrentImport } from '@/modules/health-data/lib/retention'
import { serializeImport } from '@/modules/health-data/lib/serialize'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/status',
  operationId: 'getHealthDataStatus',
  summary: 'Current import status (null when no data is loaded)',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Current import, if any', content: { 'application/json': { schema: StatusResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const row = await getCurrentImport(withRLS, user.id)
    return NextResponse.json({ import: row ? serializeImport(row) : null })
  } catch (error) {
    console.error('GET /api/modules/health-data/status error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
