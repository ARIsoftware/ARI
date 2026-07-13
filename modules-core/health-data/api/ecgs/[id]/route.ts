/**
 * Health Data - ECG Detail API
 *
 * GET /api/modules/health-data/ecgs/{id} — one ECG recording including
 * its full-resolution strip (fetched lazily when the user enlarges it).
 */

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/api-helpers'
import { healthDataEcgs } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { EcgDetailResponseSchema } from '@/modules/health-data/lib/validation'
import { requireHealthData } from '@/modules/health-data/lib/route-helpers'

registry.registerPath({
  method: 'get',
  path: '/api/modules/health-data/ecgs/{id}',
  operationId: 'getHealthDataEcgDetail',
  summary: 'One ECG recording with its full-resolution strip',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  request: { params: z.object({ id: z.string().uuid('Invalid ECG id') }) },
  responses: {
    200: { description: 'ECG detail', content: { 'application/json': { schema: EcgDetailResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'ECG not found or no completed import', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) {
      return createErrorResponse('Invalid ECG id', 400)
    }

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
          waveform_full: healthDataEcgs.waveformFull,
        })
        .from(healthDataEcgs)
        .where(
          and(
            eq(healthDataEcgs.id, id),
            eq(healthDataEcgs.userId, user.id),
            eq(healthDataEcgs.importId, importRow.id)
          )
        )
        .limit(1)
    )

    if (rows.length === 0) {
      return createErrorResponse('ECG not found', 404)
    }

    return NextResponse.json({ ecg: rows[0] })
  } catch (error) {
    console.error('GET /api/modules/health-data/ecgs/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
