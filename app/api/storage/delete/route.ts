import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeBucketName, validateStoredFilename, readStorageConfig } from '@/lib/storage'
import { storageDeleteSchema as deleteSchema, SuccessSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'delete',
  path: '/api/storage/delete',
  operationId: 'deleteFromStorage',
  summary: 'Delete a file from a bucket',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: deleteSchema } } } },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Invalid bucket or filename', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const storageConfig = readStorageConfig()

    const validation = await validateRequestBody(request, deleteSchema)
    if (!validation.success) {
      return validation.response
    }

    const { bucket: bucketRaw, filename: filenameRaw } = validation.data

    let sanitizedBucket: string
    try {
      sanitizedBucket = sanitizeBucketName(bucketRaw)
    } catch {
      return createErrorResponse('Invalid bucket name', 400)
    }

    const validFilename = validateStoredFilename(filenameRaw)
    if (!validFilename) {
      return createErrorResponse('Invalid filename', 400)
    }

    const provider = getStorageProvider(storageConfig)
    await provider.delete(user.id, sanitizedBucket, validFilename)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Storage Delete]', message, error instanceof Error ? error.stack : undefined)
    const exposed = process.env.NODE_ENV !== 'production'
      ? `Storage delete failed: ${message}`
      : 'Internal server error'
    return createErrorResponse(exposed, 500)
  }
}
