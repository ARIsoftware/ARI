/**
 * Module Template — File Upload Example
 *
 * Wraps the ARI File Storage System with module-specific validation.
 * For simple uploads, modules can call /api/storage/upload directly instead.
 *
 * Endpoint: POST /api/modules/module-template/upload
 *
 * Storage backend is selected by ARI_STORAGE_PROVIDER in .env.local
 * (filesystem | s3 | r2 | supabase-s3; filesystem is the default).
 * Modules never configure storage themselves — getStorageProvider() returns
 * the right backend automatically. For provider-aware logic, read
 * process.env.ARI_STORAGE_PROVIDER directly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeFilename, readStorageConfig } from '@/lib/storage'
import {
  UploadFormSchema,
  UploadResponseSchema,
} from '@/modules/module-template/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

const BUCKET = 'module-template'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

registry.registerPath({
  method: 'post',
  path: '/api/modules/module-template/upload',
  operationId: 'uploadModuleTemplateFile',
  summary: 'Upload a single image file (jpeg/png/webp, max 5MB)',
  tags: ['module-template'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'multipart/form-data': { schema: UploadFormSchema } } } },
  responses: {
    201: { description: 'Uploaded file metadata', content: { 'application/json': { schema: UploadResponseSchema } } },
    400: { description: 'No file, file too large, or disallowed content type', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    // Resolves the active provider + credentials from process.env. Sync, no DB.
    const storageConfig = readStorageConfig()

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
