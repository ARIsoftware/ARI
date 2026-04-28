import { NextRequest } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeBucketName, validateStoredFilename } from '@/lib/storage'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const { path: pathSegments } = await params

    if (!pathSegments || pathSegments.length < 2) {
      return createErrorResponse('Invalid path: expected /serve/{bucket}/{filename}', 400)
    }

    const [bucketRaw, ...filenameParts] = pathSegments
    const filename = filenameParts.join('/')

    if (!filename) {
      return createErrorResponse('Missing filename', 400)
    }

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

    const provider = getStorageProvider()
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
    console.error('[Storage Serve]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
