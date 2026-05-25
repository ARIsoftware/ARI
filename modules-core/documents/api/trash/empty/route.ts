/**
 * Documents Module - Empty Trash API
 *
 * Endpoints:
 * - POST /api/modules/documents/trash/empty - Permanently delete all items in trash
 * - DELETE /api/modules/documents/trash/empty?id=xxx - Permanently delete specific item
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { documents, documentFolders } from '@/lib/db/schema'
import { eq, isNotNull, and, lte, inArray } from 'drizzle-orm'
import { getStorageProvider } from '../../../lib/providers'
import { TRASH_RETENTION_DAYS } from '../../../types'
import type { StorageProvider } from '../../../types'
import {
  emptyTrashQuerySchema,
  trashDeleteQuerySchema,
  EmptyTrashResponseSchema,
  TrashItemDeleteResponseSchema,
} from '../../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'post',
  path: '/api/modules/documents/trash/empty',
  operationId: 'emptyDocumentsTrash',
  summary: 'Permanently delete trashed items. Pass ?auto=true to limit to items older than the retention window.',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { query: emptyTrashQuerySchema },
  responses: {
    200: { description: 'Per-bucket delete counts plus any storage backend errors', content: { 'application/json': { schema: EmptyTrashResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/documents/trash/empty',
  operationId: 'deleteTrashItem',
  summary: 'Permanently delete a single trashed document or folder (id + type in query)',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { query: trashDeleteQuerySchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: TrashItemDeleteResponseSchema } } },
    400: { description: 'Missing or invalid id, or invalid type parameter', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Document or folder not found in trash', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * POST Handler - Empty entire trash or auto-delete expired items
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const autoCleanup = searchParams.get('auto') === 'true'

    let docsToDelete: any[]
    let foldersToDelete: any[]

    if (autoCleanup) {
      // Auto-cleanup: only delete items older than retention period (scoped to the user)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - TRASH_RETENTION_DAYS)
      const cutoffStr = cutoffDate.toISOString()

      docsToDelete = await withRLS((db: any) =>
        db.select()
          .from(documents)
          .where(and(
            eq(documents.userId, user.id),
            isNotNull(documents.deletedAt),
            lte(documents.deletedAt, cutoffStr)
          ))
      )

      foldersToDelete = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.userId, user.id),
            isNotNull(documentFolders.deletedAt),
            lte(documentFolders.deletedAt, cutoffStr)
          ))
      )
    } else {
      // Manual empty: delete all items in this user's trash
      docsToDelete = await withRLS((db: any) =>
        db.select()
          .from(documents)
          .where(and(
            eq(documents.userId, user.id),
            isNotNull(documents.deletedAt)
          ))
      )

      foldersToDelete = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.userId, user.id),
            isNotNull(documentFolders.deletedAt)
          ))
      )
    }

    // Delete files from storage (parallel; tolerate per-file failures). Each
    // file is looked up under its own recorded (provider, bucket) so old
    // files survive provider/bucket changes. getStorageProvider caches by
    // (provider, bucket) at module scope so we don't construct an S3Client
    // per doc.
    const storageResults = await Promise.allSettled(
      docsToDelete.map((doc: any) =>
        getStorageProvider(doc.storageProvider as StorageProvider, doc.storageBucket)
          .delete(doc.storagePath)
      )
    )
    const deleteErrors: string[] = []
    storageResults.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const path = docsToDelete[idx].storagePath
        console.error(`Failed to delete file from storage: ${path}`, result.reason)
        deleteErrors.push(path)
      }
    })

    // Batch-delete document records (single statement)
    if (docsToDelete.length > 0) {
      const docIds = docsToDelete.map((d: any) => d.id)
      await withRLS((db: any) =>
        db.delete(documents)
          .where(and(
            eq(documents.userId, user.id),
            inArray(documents.id, docIds)
          ))
      )
    }

    // Batch-delete folder records (single statement)
    if (foldersToDelete.length > 0) {
      const folderIds = foldersToDelete.map((f: any) => f.id)
      await withRLS((db: any) =>
        db.delete(documentFolders)
          .where(and(
            eq(documentFolders.userId, user.id),
            inArray(documentFolders.id, folderIds)
          ))
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Trash emptied successfully',
      documents_deleted: docsToDelete.length,
      folders_deleted: foldersToDelete.length,
      storage_errors: deleteErrors.length > 0 ? deleteErrors : undefined,
    })

  } catch (error) {
    console.error('POST /api/modules/documents/trash/empty error:', error)
    return createErrorResponse('Internal server error')
  }
}

/**
 * DELETE Handler - Permanently delete a specific item from trash
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type') || 'document' // 'document' or 'folder'

    if (!id) {
      return createErrorResponse('Missing id parameter', 400)
    }

    if (!z.string().uuid().safeParse(id).success) {
      return createErrorResponse('Invalid ID format', 400)
    }

    if (type === 'document') {
      // Get document — scoped to user
      const doc = await withRLS((db: any) =>
        db.select()
          .from(documents)
          .where(and(
            eq(documents.id, id),
            eq(documents.userId, user.id),
            isNotNull(documents.deletedAt)
          ))
          .limit(1)
      )

      if (doc.length === 0) {
        return createErrorResponse('Document not found in trash', 404)
      }

      // Delete from storage — honor the file's recorded provider + bucket.
      try {
        const storageProvider = getStorageProvider(
          doc[0].storageProvider as StorageProvider,
          doc[0].storageBucket
        )
        await storageProvider.delete(doc[0].storagePath)
      } catch (err) {
        console.error(`Failed to delete file from storage: ${doc[0].storagePath}`, err)
      }

      // Delete record
      await withRLS((db: any) =>
        db.delete(documents)
          .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
      )

      return NextResponse.json({
        success: true,
        message: 'Document permanently deleted',
      })
    } else if (type === 'folder') {
      // Get folder — scoped to user
      const folder = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.id, id),
            eq(documentFolders.userId, user.id),
            isNotNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )

      if (folder.length === 0) {
        return createErrorResponse('Folder not found in trash', 404)
      }

      // Delete record (documents should already be soft-deleted)
      await withRLS((db: any) =>
        db.delete(documentFolders)
          .where(and(eq(documentFolders.id, id), eq(documentFolders.userId, user.id)))
      )

      return NextResponse.json({
        success: true,
        message: 'Folder permanently deleted',
      })
    } else {
      return createErrorResponse('Invalid type parameter', 400)
    }

  } catch (error) {
    console.error('DELETE /api/modules/documents/trash/empty error:', error)
    return createErrorResponse('Internal server error')
  }
}
