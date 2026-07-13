/**
 * Health Data - Sleep API
 *
 * GET /api/modules/health-data/sleep — nightly sleep sessions with stage
 * breakdown, oldest first.
 */

import { NextResponse } from 'next/server'
import { and, eq, asc } from 'drizzle-orm'
import { createErrorResponse } from '@/lib/api-helpers'
import { healthDataSleepNights } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { SleepResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/sleep',
  operationId: 'getHealthDataSleep',
  summary: 'Nightly sleep sessions with stage breakdown',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Sleep nights', content: { 'application/json': { schema: SleepResponseSchema } } },
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
          night_date: healthDataSleepNights.nightDate,
          start_time: healthDataSleepNights.startTime,
          end_time: healthDataSleepNights.endTime,
          in_bed_min: healthDataSleepNights.inBedMin,
          asleep_min: healthDataSleepNights.asleepMin,
          core_min: healthDataSleepNights.coreMin,
          deep_min: healthDataSleepNights.deepMin,
          rem_min: healthDataSleepNights.remMin,
          awake_min: healthDataSleepNights.awakeMin,
        })
        .from(healthDataSleepNights)
        .where(and(eq(healthDataSleepNights.userId, user.id), eq(healthDataSleepNights.importId, importRow.id)))
        .orderBy(asc(healthDataSleepNights.nightDate))
    )

    return NextResponse.json({ nights: rows })
  } catch (error) {
    console.error('GET /api/modules/health-data/sleep error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
