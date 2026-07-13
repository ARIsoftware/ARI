/**
 * Health Data - Activity API
 *
 * GET /api/modules/health-data/activity — daily activity-ring data
 * (move / exercise / stand with goals), oldest first.
 */

import { NextResponse } from 'next/server'
import { and, eq, asc } from 'drizzle-orm'
import { createErrorResponse } from '@/lib/api-helpers'
import { healthDataActivityDays } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { ActivityResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/activity',
  operationId: 'getHealthDataActivity',
  summary: 'Daily activity ring data (move / exercise / stand)',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Activity days', content: { 'application/json': { schema: ActivityResponseSchema } } },
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
          day: healthDataActivityDays.day,
          active_energy: healthDataActivityDays.activeEnergy,
          active_energy_goal: healthDataActivityDays.activeEnergyGoal,
          exercise_minutes: healthDataActivityDays.exerciseMinutes,
          exercise_goal: healthDataActivityDays.exerciseGoal,
          stand_hours: healthDataActivityDays.standHours,
          stand_goal: healthDataActivityDays.standGoal,
        })
        .from(healthDataActivityDays)
        .where(and(eq(healthDataActivityDays.userId, user.id), eq(healthDataActivityDays.importId, importRow.id)))
        .orderBy(asc(healthDataActivityDays.day))
    )

    return NextResponse.json({ days: rows })
  } catch (error) {
    console.error('GET /api/modules/health-data/activity error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
