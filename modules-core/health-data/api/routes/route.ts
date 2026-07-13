/**
 * Health Data - Workout Routes API
 *
 * GET /api/modules/health-data/routes — GPS workout routes (downsampled
 * [lat, lon] paths from the export's GPX files), oldest first.
 */

import { NextResponse } from 'next/server'
import { and, eq, asc } from 'drizzle-orm'
import { createErrorResponse } from '@/lib/api-helpers'
import { healthDataRoutes } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { RoutesResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/routes',
  operationId: 'listHealthDataRoutes',
  summary: 'GPS workout routes with downsampled paths, oldest first',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Workout routes', content: { 'application/json': { schema: RoutesResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'No completed import available', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const gate = await requireHealthData()
    if (!gate.ok) return gate.response
    const { user, withRLS, importRow } = gate.ctx

    const rows = await withRLS((db) =>
      db
        .select({
          id: healthDataRoutes.id,
          route_date: healthDataRoutes.routeDate,
          started_at: healthDataRoutes.startedAt,
          distance_km: healthDataRoutes.distanceKm,
          duration_min: healthDataRoutes.durationMin,
          point_count: healthDataRoutes.pointCount,
          points: healthDataRoutes.points,
        })
        .from(healthDataRoutes)
        .where(and(eq(healthDataRoutes.userId, user.id), eq(healthDataRoutes.importId, importRow.id)))
        .orderBy(asc(healthDataRoutes.routeDate), asc(healthDataRoutes.startedAt))
    )

    return NextResponse.json({ routes: rows })
  } catch (error) {
    console.error('GET /api/modules/health-data/routes error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
