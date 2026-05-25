import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeBucketName, readStorageConfig } from '@/lib/storage'
import { storageListQuerySchema as listSchema, StorageListResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/storage/list',
  operationId: 'listStorageFiles',
  summary: "List files in a bucket (paginated in-memory)",
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { query: listSchema },
  responses: {
    200: { description: 'Bucket file listing', content: { 'application/json': { schema: StorageListResponseSchema } } },
    400: { description: 'Validation error or invalid bucket', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const storageConfig = readStorageConfig()

    const validation = validateQueryParams(request.nextUrl.searchParams, listSchema)
    if (!validation.success) {
      return validation.response
    }

    const { bucket: bucketRaw } = validation.data

    let sanitizedBucket: string
    try {
      sanitizedBucket = sanitizeBucketName(bucketRaw)
    } catch {
      return createErrorResponse('Invalid bucket name', 400)
    }

    const limit = validation.data.limit ?? 200
    const offset = validation.data.offset ?? 0

    const provider = getStorageProvider(storageConfig)
    // Note: pagination is in-memory (reads all files, then slices). Fine for typical bucket sizes.
    const allFiles = await provider.list(user.id, sanitizedBucket)
    const files = allFiles.slice(offset, offset + limit)

    return NextResponse.json({ files, total: allFiles.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Storage List]', message, error instanceof Error ? error.stack : undefined)
    const exposed = process.env.NODE_ENV !== 'production'
      ? `Storage list failed: ${message}`
      : 'Internal server error'
    return createErrorResponse(exposed, 500)
  }
}
