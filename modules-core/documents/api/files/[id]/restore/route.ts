/**
 * Documents Module - File Restore API
 *
 * Endpoint:
 * - POST /api/modules/documents/files/[id]/restore - Restore file from trash
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, createErrorResponse } from '@/lib/api-helpers'
import { documents } from '@/lib/db/schema'
import { eq, and, isNotNull, sql } from 'drizzle-orm'
import {
  idParamSchema,
  RestoreDocumentResponseSchema,
} from '../../../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'post',
  path: '/api/modules/documents/files/{id}/restore',
  operationId: 'restoreDocumentFile',
  summary: 'Restore a soft-deleted document from trash',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { params: idParamSchema },
  responses: {
    200: { description: 'Restored document', content: { 'application/json': { schema: RestoreDocumentResponseSchema } } },
    400: { description: 'Invalid id format', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Document not found in trash', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * POST Handler - Restore file from trash
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { id } = await params

    if (!z.string().uuid().safeParse(id).success) {
      return createErrorResponse('Invalid ID format', 400)
    }

    const restored = await withRLS((db: any) =>
      db.update(documents)
        .set({
          deletedAt: null,
          updatedAt: sql`timezone('utc'::text, now())`,
        })
        .where(and(
          eq(documents.id, id),
          eq(documents.userId, user.id),
          isNotNull(documents.deletedAt)
        ))
        .returning()
    )

    if (restored.length === 0) {
      return createErrorResponse('Document not found in trash', 404)
    }

    return NextResponse.json({
      success: true,
      message: 'Document restored successfully',
      document: toSnakeCase(restored[0]),
    })

  } catch (error) {
    console.error('POST /api/modules/documents/files/[id]/restore error:', error)
    return createErrorResponse('Internal server error')
  }
}
