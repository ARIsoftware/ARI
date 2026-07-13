/**
 * Health Data - Metrics API
 *
 * GET /api/modules/health-data/metrics?types=step_count,heart_rate&from=...&to=...
 *
 * Daily series for up to 20 metric types at once, grouped per type.
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte, inArray, asc } from 'drizzle-orm'
import { createErrorResponse, validateQueryParams } from '@/lib/api-helpers'
import { healthDataDailyMetrics } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { metricsQuerySchema, MetricsResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'
import type { MetricSeries } from '@/modules/health-data/types'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/metrics',
  operationId: 'getHealthDataMetrics',
  summary: 'Daily series for the requested metric types',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  request: { query: metricsQuerySchema },
  responses: {
    200: { description: 'One series per requested metric type', content: { 'application/json': { schema: MetricsResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'No completed import available', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, metricsQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    const types = [...new Set(queryValidation.data.types.split(','))]
    const { from, to } = queryValidation.data

    const gate = await requireHealthData()
    if (!gate.ok) return gate.response
    const { user, withRLS, importRow } = gate.ctx

    const conditions = [
      eq(healthDataDailyMetrics.userId, user.id),
      eq(healthDataDailyMetrics.importId, importRow.id),
      inArray(healthDataDailyMetrics.metricType, types),
    ]
    if (from) conditions.push(gte(healthDataDailyMetrics.metricDate, from))
    if (to) conditions.push(lte(healthDataDailyMetrics.metricDate, to))

    const rows = await withRLS((db) =>
      db
        .select({
          metricType: healthDataDailyMetrics.metricType,
          metricDate: healthDataDailyMetrics.metricDate,
          unit: healthDataDailyMetrics.unit,
          valueSum: healthDataDailyMetrics.valueSum,
          valueMin: healthDataDailyMetrics.valueMin,
          valueMax: healthDataDailyMetrics.valueMax,
          valueAvg: healthDataDailyMetrics.valueAvg,
          sampleCount: healthDataDailyMetrics.sampleCount,
        })
        .from(healthDataDailyMetrics)
        .where(and(...conditions))
        .orderBy(asc(healthDataDailyMetrics.metricDate))
    )

    const seriesByType = new Map<string, MetricSeries>()
    for (const type of types) {
      seriesByType.set(type, { metric_type: type, unit: null, data: [] })
    }
    for (const row of rows) {
      const series = seriesByType.get(row.metricType)
      if (!series) continue
      if (series.unit === null) series.unit = row.unit
      series.data.push({
        metric_date: row.metricDate,
        value_sum: row.valueSum,
        value_min: row.valueMin,
        value_max: row.valueMax,
        value_avg: row.valueAvg,
        sample_count: row.sampleCount,
      })
    }

    return NextResponse.json({ series: [...seriesByType.values()] })
  } catch (error) {
    console.error('GET /api/modules/health-data/metrics error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
