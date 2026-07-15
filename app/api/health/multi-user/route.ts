import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { pool } from '@/lib/db/pool'
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

const REQUIRED_COLUMNS = ['role', 'permissions', 'disabled'] as const

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
  if (!pool) return NextResponse.json({ error: 'Database not available' }, { status: 500 })

  try {
    const { rows: colRows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user'
         AND column_name = ANY($1::text[])`,
      [[...REQUIRED_COLUMNS]]
    )
    const present = new Set(colRows.map((r) => r.column_name))
    const missingColumns = REQUIRED_COLUMNS.filter((c) => !present.has(c))
    const columnsPresent = missingColumns.length === 0

    // Phase 3's shared-workspace switch — the RLS policies on shared content
    // tables call this function, so its absence means the shared-workspace DDL
    // didn't fully apply (e.g. a restored pre-Phase-3 backup). Boot re-applies
    // setup.sql, which recreates it.
    const { rows: fnRows } = await pool.query<{ present: boolean }>(
      `SELECT to_regprocedure('app.can_access_shared()') IS NOT NULL AS present`
    )
    const sharedAccessFunction = fnRows[0]?.present === true

    // The admin count is only meaningful once the columns exist.
    let activeAdminCount: number | null = null
    if (present.has('role') && present.has('disabled')) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM "user" WHERE "role" = 'admin' AND "disabled" = FALSE`
      )
      activeAdminCount = Number(rows[0]?.count ?? 0)
    }
    const hasActiveAdmin = (activeAdminCount ?? 0) > 0

    return NextResponse.json({
      ok: columnsPresent && sharedAccessFunction && hasActiveAdmin,
      columnsPresent,
      missingColumns,
      sharedAccessFunction,
      activeAdminCount,
      hasActiveAdmin,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check multi-user setup' },
      { status: 500 }
    )
  }
}
