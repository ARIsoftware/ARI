/**
 * Motivation — single video endpoint.
 *   DELETE /api/modules/motivation/videos/[id]  → remove a video
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { VideoDeleteResponseSchema, uuidSchema } from '@/modules/motivation/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { motivationVideos } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

registry.registerPath({
  method: 'delete',
  path: '/api/modules/motivation/videos/{id}',
  operationId: 'deleteMotivationVideo',
  summary: 'Delete a saved video by id',
  tags: ['motivation'],
  security: DEFAULT_SECURITY,
  request: {
    params: z.object({ id: uuidSchema }),
  },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: VideoDeleteResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Video not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const parsed = uuidSchema.safeParse(id)
    if (!parsed.success) {
      return createErrorResponse('Invalid video id format', 400)
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const deleted = await withRLS((db) =>
      db
        .delete(motivationVideos)
        .where(and(eq(motivationVideos.id, parsed.data), eq(motivationVideos.userId, user.id)))
        .returning({ id: motivationVideos.id }),
    )

    if (deleted.length === 0) {
      return createErrorResponse('Video not found', 404)
    }

    return NextResponse.json({ success: true, message: 'Video deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/modules/motivation/videos/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
