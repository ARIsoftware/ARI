/**
 * Health Data - Data API
 *
 * DELETE /api/modules/health-data/data
 *
 * Immediately deletes all of the user's imported health data (the
 * "Delete now" button — no need to wait for the 1-hour expiry).
 */

import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { healthDataImports } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { DeleteResponseSchema } from '@/modules/health-data/lib/validation'

registry.registerPath({
  method: 'delete',
  path: '/api/modules/health-data/data',
  operationId: 'deleteHealthData',
  summary: 'Delete all imported health data immediately',
  tags: ['health-data'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'All health data deleted', content: { 'application/json': { schema: DeleteResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function DELETE() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    // Cascades to all parsed data; any in-flight parse job aborts on its
    // next progress write.
    await withRLS((db) =>
      db.delete(healthDataImports).where(eq(healthDataImports.userId, user.id))
    )

    return NextResponse.json({ success: true, message: 'All health data deleted' })
  } catch (error) {
    console.error('DELETE /api/modules/health-data/data error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
