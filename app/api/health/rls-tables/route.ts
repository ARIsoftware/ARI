import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkRlsTables } from '@/lib/health/checks'
import { HealthRlsTablesSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

export const debugRole = 'health-rls-tables'

registry.registerPath({
  method: 'get',
  path: '/api/health/rls-tables',
  operationId: 'getHealthRlsTables',
  summary: 'Per-table RLS audit: enabled/forced flags and policy counts for every public table, plus whether the connection role bypasses RLS',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Per-table RLS coverage report', content: { 'application/json': { schema: HealthRlsTablesSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

/**
 * GET /api/health/rls-tables
 * Read-only catalog scan (pg_class + pg_policy) — the pre-flight audit view
 * for DB-level RLS enforcement. Flags tables where RLS is disabled and, worse,
 * tables with RLS enabled but zero policies (deny-all under a non-bypass role).
 */
async function handleGET() {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  try {
    const result = await checkRlsTables()
    // null means no pool is configured — distinct from "the scan ran and failed".
    if (!result) return NextResponse.json({ error: 'Database not available' }, { status: 500 })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scan RLS coverage' },
      { status: 500 }
    )
  }
}

export const GET = withApiLogging(handleGET)
