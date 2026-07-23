import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, validatePathParams } from '@/lib/api-helpers'
import { getStorageProvider, readStorageConfig } from '@/lib/storage'
import { ChatDeleteResponseSchema, chatIdParamSchema } from '@/modules/chat/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { chatUploads } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

registry.registerPath({
  method: 'delete',
  path: '/api/modules/chat/uploads/{id}',
  operationId: 'deleteChatUpload',
  summary: 'Delete an uploaded file (removes from storage + metadata)',
  tags: ['chat'],
  security: DEFAULT_SECURITY,
  request: { params: chatIdParamSchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: ChatDeleteResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Upload not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const parsed = validatePathParams(await context.params, chatIdParamSchema)
    if (!parsed.success) return parsed.response
    const { id } = parsed.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) return createErrorResponse('Unauthorized', 401)

    const found = await withRLS((db) =>
      db
        .select()
        .from(chatUploads)
        .where(and(eq(chatUploads.id, id), eq(chatUploads.userId, user.id)))
        .limit(1)
    )
    if (found.length === 0) return createErrorResponse('Upload not found', 404)
    const row = found[0]

    const storage = getStorageProvider(readStorageConfig())
    try {
      await storage.delete(user.id, row.bucket, row.filename)
    } catch (err) {
      console.error('[chat] storage delete failed (continuing with DB row removal):', err instanceof Error ? err.message : err)
    }

    await withRLS((db) =>
      db.delete(chatUploads).where(and(eq(chatUploads.id, id), eq(chatUploads.userId, user.id)))
    )

    return NextResponse.json({ success: true, message: 'Upload deleted' })
  } catch (error) {
    console.error('DELETE /api/modules/chat/uploads/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
