/**
 * Module Template — File Upload Example
 *
 * Demonstrates how a module can wrap the ARI File Storage System
 * with module-specific validation and logic.
 *
 * For simple uploads, modules can also call /api/storage/upload directly
 * from the client without creating a module-specific endpoint.
 *
 * Endpoint: POST /api/modules/module-template/upload
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeFilename, readStorageConfig } from '@/lib/storage'

const BUCKET = 'module-template'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const storageConfig = await readStorageConfig(withRLS)

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return createErrorResponse('No file provided', 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return createErrorResponse(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400)
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return createErrorResponse(`File type "${file.type}" is not allowed. Accepted: ${ALLOWED_TYPES.join(', ')}`, 400)
    }

    const storage = getStorageProvider(storageConfig)
    const buffer = Buffer.from(await file.arrayBuffer())
    const sanitizedName = sanitizeFilename(file.name)

    const result = await storage.upload(user.id, BUCKET, sanitizedName, buffer, file.type)

    // Optional: store file metadata in your module's database table
    // await withRLS((db) => db.insert(moduleTemplateFiles).values({
    //   userId: user.id,
    //   filename: result.name,
    //   bucket: BUCKET,
    //   contentType: file.type,
    //   size: file.size,
    // }))

    return NextResponse.json({ path: result.path, name: result.name }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/module-template/upload error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
