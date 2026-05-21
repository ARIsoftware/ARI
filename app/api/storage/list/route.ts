import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeBucketName, readStorageConfig } from '@/lib/storage'

const listSchema = z.object({
  bucket: z.string(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
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
