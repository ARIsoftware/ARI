/**
 * Health Data - Workouts API
 *
 * GET /api/modules/health-data/workouts — all workouts, newest first.
 */

import { NextResponse } from 'next/server'
import { and, eq, desc } from 'drizzle-orm'
import { createErrorResponse } from '@/lib/api-helpers'
import { healthDataWorkouts } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { WorkoutsResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/workouts',
  operationId: 'listHealthDataWorkouts',
  summary: 'All workouts from the loaded export, newest first',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Workout list', content: { 'application/json': { schema: WorkoutsResponseSchema } } },
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
          id: healthDataWorkouts.id,
          activity_type: healthDataWorkouts.activityType,
          start_time: healthDataWorkouts.startTime,
          end_time: healthDataWorkouts.endTime,
          duration_min: healthDataWorkouts.durationMin,
          distance_km: healthDataWorkouts.distanceKm,
          energy_kcal: healthDataWorkouts.energyKcal,
          avg_heart_rate: healthDataWorkouts.avgHeartRate,
          max_heart_rate: healthDataWorkouts.maxHeartRate,
          elevation_gain_m: healthDataWorkouts.elevationGainM,
          source_name: healthDataWorkouts.sourceName,
        })
        .from(healthDataWorkouts)
        .where(and(eq(healthDataWorkouts.userId, user.id), eq(healthDataWorkouts.importId, importRow.id)))
        .orderBy(desc(healthDataWorkouts.startTime))
    )

    return NextResponse.json({ workouts: rows })
  } catch (error) {
    console.error('GET /api/modules/health-data/workouts error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
