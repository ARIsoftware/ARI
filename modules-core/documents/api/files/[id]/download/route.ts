/**
 * Documents Module - File Download API
 *
 * Endpoint:
 * - GET /api/modules/documents/files/[id]/download - Get secure download URL
 *
 * Security: Returns a time-limited signed URL (5 minutes) for secure download.
 * The actual file is never served through this endpoint - only the signed URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { documents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getStorageProvider } from '../../../../lib/providers'
import type { StorageProvider } from '../../../../types'
import {
  idParamSchema,
  DownloadResponseSchema,
} from '../../../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/documents/files/{id}/download',
  operationId: 'getDocumentDownloadUrl',
  summary: 'Generate a time-limited signed download URL (5 min) for a document',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { params: idParamSchema },
  responses: {
    200: { description: 'Signed URL plus filename + mime + size + expiry', content: { 'application/json': { schema: DownloadResponseSchema } } },
    400: { description: 'Invalid id format', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Document not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * GET Handler - Generate signed download URL
 */
export async function GET(
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

    // Get document — RLS plus an explicit user_id filter (defense-in-depth).
    // Allow downloading from trash (don't filter by deletedAt).
    const doc = await withRLS((db: any) =>
      db.select()
        .from(documents)
        .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
        .limit(1)
    )

    if (doc.length === 0) {
      return createErrorResponse('Document not found', 404)
    }

    const document = doc[0]

    // Use the exact provider + bucket recorded at upload time so old files
    // remain reachable even after the global ARI_STORAGE_PROVIDER changes.
    const storageProvider = getStorageProvider(
      document.storageProvider as StorageProvider,
      document.storageBucket
    )

    // Generate signed URL (expires in 5 minutes). Force Content-Disposition:
    // attachment so the browser downloads rather than rendering inline — this
    // neutralizes stored-XSS via uploaded HTML/SVG with attacker-supplied MIME.
    const expiresInSeconds = 300
    const signedUrl = await storageProvider.getSignedUrl(
      document.storagePath,
      expiresInSeconds,
      { filename: document.originalName }
    )

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

    return NextResponse.json({
      url: signedUrl,
      filename: document.originalName,
      mime_type: document.mimeType,
      size_bytes: document.sizeBytes,
      expires_at: expiresAt,
    })

  } catch (error) {
    console.error('GET /api/modules/documents/files/[id]/download error:', error)
    return createErrorResponse('Internal server error')
  }
}
