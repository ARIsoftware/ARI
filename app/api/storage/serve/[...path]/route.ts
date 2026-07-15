import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeBucketName, validateStoredFilename, readStorageConfig } from '@/lib/storage'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/storage/serve/{bucket}/{filename}',
  operationId: 'serveStorageFile',
  summary: 'Stream a binary file from a bucket (Content-Disposition: attachment, no inline render)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: {
    params: z.object({
      bucket: z.string(),
      filename: z.string(),
    }),
  },
  responses: {
    200: { description: 'Binary file stream', content: { '*/*': { schema: { type: 'string', format: 'binary' } } } },
    400: { description: 'Invalid path / bucket / filename', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'File not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

// Buckets whose files are shared across all authenticated users (collaborative
// modules that store binary files — currently just the documents module's
// bucket). Only these honour a cross-user `?owner=`; every other bucket
// (fitness photos, health data, chat uploads, …) stays private to the
// uploader. Extendable via ARI_SHARED_STORAGE_BUCKETS (comma-separated).
const SHARED_STORAGE_BUCKETS = new Set(
  ['documents', ...(process.env.ARI_SHARED_STORAGE_BUCKETS?.split(',') ?? [])]
    .map((b) => b.trim())
    .filter(Boolean)
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const storageConfig = readStorageConfig()

    const { path: pathSegments } = await params

    if (!pathSegments || pathSegments.length !== 2) {
      return createErrorResponse('Invalid path: expected /serve/{bucket}/{filename}', 400)
    }

    const [bucketRaw, filename] = pathSegments

    let sanitizedBucket: string
    try {
      sanitizedBucket = sanitizeBucketName(bucketRaw)
    } catch {
      return createErrorResponse('Invalid bucket name', 400)
    }

    const validFilename = validateStoredFilename(filename)
    if (!validFilename) {
      return createErrorResponse('Invalid filename', 400)
    }

    // Files are stored under the uploader's id. By default we serve the
    // requester's own files. A cross-user `?owner=` is honoured ONLY for
    // shared buckets, so private-module files can never be read by another
    // user even if they guess the path.
    const requestedOwner = request.nextUrl.searchParams.get('owner')
    let ownerId = user.id
    if (requestedOwner && requestedOwner !== user.id) {
      // owner becomes an on-disk directory segment, so validate it as a plain
      // account id (no path separators or traversal) before trusting it — the
      // filesystem provider only guards against escaping the storage root, not
      // against landing in another user's directory. Cross-user access is then
      // allowed only for shared buckets.
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestedOwner)) {
        return createErrorResponse('Invalid owner', 400)
      }
      if (!SHARED_STORAGE_BUCKETS.has(sanitizedBucket)) {
        return createErrorResponse('Forbidden', 403)
      }
      ownerId = requestedOwner
    }

    const provider = getStorageProvider(storageConfig)
    const result = await provider.serve(ownerId, sanitizedBucket, validFilename)

    if (!result) {
      return createErrorResponse('File not found', 404)
    }

    return new Response(result.stream, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.size),
        'Content-Disposition': 'attachment',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'",
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Storage Serve]', message, error instanceof Error ? error.stack : undefined)
    const exposed = process.env.NODE_ENV !== 'production'
      ? `Storage serve failed: ${message}`
      : 'Internal server error'
    return createErrorResponse(exposed, 500)
  }
}
