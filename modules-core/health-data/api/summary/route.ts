/**
 * Health Data - Summary API
 *
 * GET /api/modules/health-data/summary
 *
 * Overview payload: profile facts, clinical records, the per-metric
 * catalog (days covered, totals, averages), and collection counts.
 */

import { NextResponse } from 'next/server'
import { and, eq, count, sql } from 'drizzle-orm'
import { createErrorResponse } from '@/lib/api-helpers'
import {
  healthDataDailyMetrics,
  healthDataWorkouts,
  healthDataActivityDays,
  healthDataSleepNights,
  healthDataEcgs,
} from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { SummaryResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'
import { serializeImport } from '@/modules/health-data/lib/serialize'
import type { HealthProfileInfo, ClinicalRecordInfo } from '@/modules/health-data/types'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/summary',
  operationId: 'getHealthDataSummary',
  summary: 'Overview summary: profile, metric catalog, and totals',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Summary of the loaded health data', content: { 'application/json': { schema: SummaryResponseSchema } } },
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

    const scope = (table: { userId: any; importId: any }) =>
      and(eq(table.userId, user.id), eq(table.importId, importRow.id))

    const [catalogRows, workoutCount, sleepCount, activityCount, ecgCount] = await Promise.all([
      withRLS((db) =>
        db
          .select({
            metricType: healthDataDailyMetrics.metricType,
            unit: healthDataDailyMetrics.unit,
            days: count(),
            total: sql<string | null>`sum(${healthDataDailyMetrics.valueSum})`,
            average: sql<string | null>`avg(${healthDataDailyMetrics.valueAvg})`,
            firstDate: sql<string | null>`min(${healthDataDailyMetrics.metricDate})`,
            lastDate: sql<string | null>`max(${healthDataDailyMetrics.metricDate})`,
          })
          .from(healthDataDailyMetrics)
          .where(scope(healthDataDailyMetrics))
          .groupBy(healthDataDailyMetrics.metricType, healthDataDailyMetrics.unit)
      ),
      withRLS((db) => db.select({ value: count() }).from(healthDataWorkouts).where(scope(healthDataWorkouts))),
      withRLS((db) => db.select({ value: count() }).from(healthDataSleepNights).where(scope(healthDataSleepNights))),
      withRLS((db) => db.select({ value: count() }).from(healthDataActivityDays).where(scope(healthDataActivityDays))),
      withRLS((db) => db.select({ value: count() }).from(healthDataEcgs).where(scope(healthDataEcgs))),
    ])

    const catalog = catalogRows
      .map((row) => ({
        metric_type: row.metricType,
        unit: row.unit,
        days: Number(row.days),
        total: row.total === null ? null : Number(row.total),
        average: row.average === null ? null : Number(row.average),
        first_date: row.firstDate,
        last_date: row.lastDate,
      }))
      .sort((a, b) => b.days - a.days)

    // Overall date coverage falls out of the per-metric catalog
    let firstDate: string | null = null
    let lastDate: string | null = null
    for (const entry of catalog) {
      if (entry.first_date && (!firstDate || entry.first_date < firstDate)) firstDate = entry.first_date
      if (entry.last_date && (!lastDate || entry.last_date > lastDate)) lastDate = entry.last_date
    }

    return NextResponse.json({
      import: serializeImport(importRow),
      profile: (importRow.profile as HealthProfileInfo | null) ?? null,
      clinical: (importRow.clinical as ClinicalRecordInfo[] | null) ?? [],
      locale: importRow.locale,
      catalog,
      totals: {
        workouts: Number(workoutCount[0]?.value ?? 0),
        sleep_nights: Number(sleepCount[0]?.value ?? 0),
        activity_days: Number(activityCount[0]?.value ?? 0),
        ecgs: Number(ecgCount[0]?.value ?? 0),
        first_date: firstDate,
        last_date: lastDate,
      },
    })
  } catch (error) {
    console.error('GET /api/modules/health-data/summary error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
