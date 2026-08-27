/**
 * Aggregate health scan — one call, one reply.
 *
 * Runs every server-side check in a single request and returns a normalised
 * summary plus each check's full payload. Intended for monitoring, CI, and
 * scheduled scans, where issuing seven separate authenticated requests and
 * reassembling them client-side isn't practical.
 *
 * POST (not GET) because the RLS check writes and deletes a sentinel row —
 * the same reasoning as /api/health/rls-test.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { runHealthScan } from '@/lib/health/run-scan'
import { safeErrorResponse } from '@/lib/api-error'
import { HealthScanSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import {
  DEFAULT_SECURITY,
  InternalServerErrorResponse,
  UnauthorizedResponse,
} from '@/lib/openapi/common'

export const dynamic = 'force-dynamic'
export const debugRole = 'health-full'

registry.registerPath({
  method: 'post',
  path: '/api/health/full',
  operationId: 'runFullHealthScan',
  summary: 'Run every server-side health check in one request and return an aggregate report',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: 'Scan completed with no failing checks (status ok or warn)',
      content: { 'application/json': { schema: HealthScanSchema } },
    },
    401: UnauthorizedResponse,
    503: {
      description: 'Scan completed but at least one check failed',
      content: { 'application/json': { schema: HealthScanSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

export async function POST() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const result = await runHealthScan({ userId: user.id, withRLS })

    // 503 on failure so uptime monitors and cron wrappers can treat the HTTP
    // status alone as the signal, without parsing the body. `warn` stays 200 —
    // warnings are informational and shouldn't page anyone.
    return NextResponse.json(result, { status: result.status === 'fail' ? 503 : 200 })
  } catch (err) {
    return NextResponse.json({ error: safeErrorResponse(err) }, { status: 500 })
  }
}
