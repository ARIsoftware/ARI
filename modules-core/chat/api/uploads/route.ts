import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, validateQueryParams, toSnakeCase } from '@/lib/api-helpers'
import { getStorageProvider, sanitizeFilename, readStorageConfig } from '@/lib/storage'
import {
  chatListQuerySchema,
  ChatUploadListResponseSchema,
  ChatUploadSingleResponseSchema,
  UploadFormSchema,
} from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { chatConversations, chatUploads } from '@/lib/db/schema'
import { and, count, desc, eq } from 'drizzle-orm'
import { CHAT_BUCKET, UUID_RE } from '@/modules/chat/lib/utils'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB — matches the central storage default.
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]
registry.registerPath({
  method: 'get',
  path: '/api/modules/chat/uploads',
  operationId: 'listChatUploads',
  summary: "List the user's chat uploads (most recent first)",
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { query: chatListQuerySchema },
  responses: {
    200: { description: 'List of uploads', content: { 'application/json': { schema: ChatUploadListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/chat/uploads',
  operationId: 'uploadChatFile',
  summary: 'Upload a file to the chat bucket (max 25MB) and record metadata',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'multipart/form-data': { schema: UploadFormSchema } } } },
  responses: {
    201: { description: 'Uploaded file metadata', content: { 'application/json': { schema: ChatUploadSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const query = validateQueryParams(request.nextUrl.searchParams, chatListQuerySchema)
    if (!query.success) return query.response
    const { limit, offset } = query.data as { limit: number; offset: number }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const rows = await withRLS((db) =>
      db
        .select()
        .from(chatUploads)
        .where(eq(chatUploads.userId, user.id))
        .orderBy(desc(chatUploads.createdAt))
        .limit(limit)
        .offset(offset)
    )
    const totalRows = await withRLS((db) =>
      db.select({ value: count() }).from(chatUploads).where(eq(chatUploads.userId, user.id))
    )

    return NextResponse.json({ uploads: toSnakeCase(rows), count: rows.length, total: totalRows[0].value })
  } catch (error) {
    console.error('GET /api/modules/chat/uploads error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const conversationIdRaw = formData.get('conversation_id')
    const conversationId =
      typeof conversationIdRaw === 'string' && UUID_RE.test(conversationIdRaw) ? conversationIdRaw : null

    if (!file) return createErrorResponse('No file provided', 400)
    if (file.size > MAX_FILE_SIZE) {
      return createErrorResponse(`File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`, 400)
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return createErrorResponse(
        `File type "${file.type || 'unknown'}" is not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}`,
        400
      )
    }

    // A supplied conversation id must belong to the caller — the FK only
    // proves existence, not ownership.
    if (conversationId) {
      const owned = await withRLS((db) =>
        db
          .select({ id: chatConversations.id })
          .from(chatConversations)
          .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, user.id)))
          .limit(1)
      )
      if (owned.length === 0) return createErrorResponse('Invalid conversation', 400)
    }

    const storage = getStorageProvider(readStorageConfig())
    const buffer = Buffer.from(await file.arrayBuffer())
    const sanitizedName = sanitizeFilename(file.name)
    const result = await storage.upload(user.id, CHAT_BUCKET, sanitizedName, buffer, file.type)

    const rows = await withRLS((db) =>
      db
        .insert(chatUploads)
        .values({
          userId: user.id,
          conversationId: conversationId,
          filename: result.name,
          // Keep the display name renderable: strip <, > and control chars.
          originalName: file.name.replace(/[<>\x00-\x1F\x7F]/g, '').trim().slice(0, 512) || sanitizedName,
          mime: file.type,
          size: file.size,
          bucket: CHAT_BUCKET,
        })
        .returning()
    )

    return NextResponse.json({ upload: toSnakeCase(rows[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/chat/uploads error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
