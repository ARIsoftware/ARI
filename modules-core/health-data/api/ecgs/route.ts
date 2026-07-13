/**
 * Health Data - ECG API
 *
 * GET /api/modules/health-data/ecgs — ECG recordings with downsampled
 * waveforms, newest first.
 */

import { NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { createErrorResponse } from '@/lib/api-helpers'
import { healthDataEcgs } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { EcgsResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/ecgs',
  operationId: 'listHealthDataEcgs',
  summary: 'ECG recordings with downsampled waveform previews',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'ECG recordings', content: { 'application/json': { schema: EcgsResponseSchema } } },
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
          id: healthDataEcgs.id,
          recorded_at: healthDataEcgs.recordedAt,
          classification: healthDataEcgs.classification,
          symptoms: healthDataEcgs.symptoms,
          average_heart_rate: healthDataEcgs.averageHeartRate,
          sampling_frequency_hz: healthDataEcgs.samplingFrequencyHz,
          sample_count: healthDataEcgs.sampleCount,
          duration_sec: healthDataEcgs.durationSec,
          device: healthDataEcgs.device,
          waveform: healthDataEcgs.waveform,
        })
        .from(healthDataEcgs)
        .where(and(eq(healthDataEcgs.userId, user.id), eq(healthDataEcgs.importId, importRow.id)))
        // NULLS LAST so ECGs with an unparsed recorded_at don't float to the top
        .orderBy(sql`${healthDataEcgs.recordedAt} DESC NULLS LAST`)
    )

    return NextResponse.json({ ecgs: rows })
  } catch (error) {
    console.error('GET /api/modules/health-data/ecgs error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
