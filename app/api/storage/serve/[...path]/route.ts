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

export async function GET(
  _request: NextRequest,
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

    const provider = getStorageProvider(storageConfig)
    const result = await provider.serve(user.id, sanitizedBucket, validFilename)

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
