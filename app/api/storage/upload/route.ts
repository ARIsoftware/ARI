import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import {
  getStorageProvider,
  getBucketConfig,
  sanitizeFilename,
  sanitizeBucketName,
  getMimeTypeForExtension,
  isStorageUnavailable,
  readStorageConfig,
} from '@/lib/storage'

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const storageConfig = readStorageConfig()

    if (isStorageUnavailable(storageConfig)) {
      return createErrorResponse(
        'File storage is not available. Local filesystem storage does not persist on Vercel. Set ARI_STORAGE_PROVIDER and the corresponding credentials in your environment to use a cloud provider.',
        503
      )
    }

    // Early rejection of oversized requests before reading the full body into memory
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > 30 * 1024 * 1024) {
      return createErrorResponse('Request too large', 413)
    }

    const formData = await request.formData()
    const bucketRaw = formData.get('bucket')
    const file = formData.get('file')

    if (!bucketRaw || typeof bucketRaw !== 'string') {
      return createErrorResponse('Missing required field: bucket', 400)
    }

    if (!file || !(file instanceof File)) {
      return createErrorResponse('Missing required field: file', 400)
    }

    let sanitizedBucket: string
    try {
      sanitizedBucket = sanitizeBucketName(bucketRaw)
    } catch {
      return createErrorResponse('Invalid bucket name', 400)
    }

    const sanitizedFilename = sanitizeFilename(file.name)
    const config = getBucketConfig(sanitizedBucket)

    // Validate file size
    if (file.size > config.maxFileSize) {
      return createErrorResponse(
        `File too large. Maximum size is ${Math.round(config.maxFileSize / 1024 / 1024)}MB`,
        400
      )
    }

    // Block executable/script extensions (check ALL extensions, not just the last, to prevent double-extension bypass)
    const parts = sanitizedFilename.split('.')
    if (parts.length > 1) {
      for (const part of parts.slice(1)) {
        if (config.blockedExtensions.includes('.' + part.toLowerCase())) {
          return createErrorResponse('This file type is not allowed for security reasons', 400)
        }
      }
    }

    // Validate MIME type using extension (if allowlist is configured)
    if (config.allowedMimeTypes.length > 0) {
      const extensionMime = getMimeTypeForExtension(sanitizedFilename)
      if (!config.allowedMimeTypes.includes(extensionMime)) {
        return createErrorResponse('File type not allowed', 400)
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const provider = getStorageProvider(storageConfig)
    const result = await provider.upload(user.id, sanitizedBucket, sanitizedFilename, buffer, file.type)

    return NextResponse.json({ path: result.path, name: result.name }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Storage Upload]', message, error instanceof Error ? error.stack : undefined)
    const exposed = process.env.NODE_ENV !== 'production'
      ? `Storage upload failed: ${message}`
      : 'Internal server error'
    return createErrorResponse(exposed, 500)
  }
}
