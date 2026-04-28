import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import {
  getStorageProvider,
  getBucketConfig,
  sanitizeFilename,
  sanitizeBucketName,
  getMimeTypeForExtension,
} from '@/lib/storage'

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
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

    // Validate MIME type using extension (not client-declared type, which is easily spoofed)
    if (config.allowedMimeTypes.length > 0) {
      const extensionMime = getMimeTypeForExtension(sanitizedFilename)
      if (!config.allowedMimeTypes.includes(extensionMime)) {
        return createErrorResponse('File type not allowed', 400)
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const provider = getStorageProvider()
    const result = await provider.upload(user.id, sanitizedBucket, sanitizedFilename, buffer, file.type)

    return NextResponse.json({ path: result.path, name: result.name }, { status: 201 })
  } catch (error: unknown) {
    console.error('[Storage Upload]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
