/**
 * Documents Module - Empty Trash API
 *
 * Endpoints:
 * - POST /api/modules/documents/trash/empty - Permanently delete all items in trash
 * - DELETE /api/modules/documents/trash/empty?id=xxx - Permanently delete specific item
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { documents, documentFolders, moduleSettings } from '@/lib/db/schema'
import { eq, isNotNull, and, lte, sql } from 'drizzle-orm'
import { getStorageProvider } from '../../../lib/providers'
import type { DocumentsSettings } from '../../../types'
import { DEFAULT_DOCUMENTS_SETTINGS, TRASH_RETENTION_DAYS } from '../../../types'

async function getSettings(withRLS: any): Promise<DocumentsSettings> {
  const data = await withRLS((db: any) =>
    db.select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(eq(moduleSettings.moduleId, 'documents'))
      .limit(1)
  )

  if (data.length === 0) {
    return DEFAULT_DOCUMENTS_SETTINGS
  }

  return {
    ...DEFAULT_DOCUMENTS_SETTINGS,
    ...(data[0]?.settings as object || {}),
  } as DocumentsSettings
}

/**
 * POST Handler - Empty entire trash or auto-delete expired items
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const autoCleanup = searchParams.get('auto') === 'true'

    const settings = await getSettings(withRLS)

    let docsToDelete: any[]
    let foldersToDelete: any[]

    if (autoCleanup) {
      // Auto-cleanup: only delete items older than retention period
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - TRASH_RETENTION_DAYS)
      const cutoffStr = cutoffDate.toISOString()

      docsToDelete = await withRLS((db: any) =>
        db.select()
          .from(documents)
          .where(and(
            isNotNull(documents.deletedAt),
            lte(documents.deletedAt, cutoffStr)
          ))
      )

      foldersToDelete = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            isNotNull(documentFolders.deletedAt),
            lte(documentFolders.deletedAt, cutoffStr)
          ))
      )
    } else {
      // Manual empty: delete all items in trash
      docsToDelete = await withRLS((db: any) =>
        db.select()
          .from(documents)
          .where(isNotNull(documents.deletedAt))
      )

      foldersToDelete = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(isNotNull(documentFolders.deletedAt))
      )
    }

    // Delete files from storage
    const storageProvider = getStorageProvider(settings)
    const deleteErrors: string[] = []

    for (const doc of docsToDelete) {
      try {
        await storageProvider.delete(doc.storagePath)
      } catch (err) {
        console.error(`Failed to delete file from storage: ${doc.storagePath}`, err)
        deleteErrors.push(doc.storagePath)
      }
    }

    // Delete document records
    for (const doc of docsToDelete) {
      await withRLS((db: any) =>
        db.delete(documents)
          .where(eq(documents.id, doc.id))
      )
    }

    // Delete folder records
    for (const folder of foldersToDelete) {
      await withRLS((db: any) =>
        db.delete(documentFolders)
          .where(eq(documentFolders.id, folder.id))
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Permanently delete a specific item from trash
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type') || 'document' // 'document' or 'folder'

    if (!id) {
      return NextResponse.json(
        { error: 'Missing id parameter' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    const settings = await getSettings(withRLS)
    const storageProvider = getStorageProvider(settings)

    if (type === 'document') {
      // Get document
      const doc = await withRLS((db: any) =>
        db.select()
          .from(documents)
          .where(and(
            eq(documents.id, id),
            isNotNull(documents.deletedAt)
          ))
          .limit(1)
      )

      if (doc.length === 0) {
        return NextResponse.json(
          { error: 'Document not found in trash' },
          { status: 404 }
        )
      }

      // Delete from storage
      try {
        await storageProvider.delete(doc[0].storagePath)
      } catch (err) {
        console.error(`Failed to delete file from storage: ${doc[0].storagePath}`, err)
      }

      // Delete record
      await withRLS((db: any) =>
        db.delete(documents)
          .where(eq(documents.id, id))
      )

      return NextResponse.json({
        success: true,
        message: 'Document permanently deleted',
      })
    } else if (type === 'folder') {
      // Get folder
      const folder = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.id, id),
            isNotNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )

      if (folder.length === 0) {
        return NextResponse.json(
          { error: 'Folder not found in trash' },
          { status: 404 }
        )
      }

      // Delete record (documents should already be soft-deleted)
      await withRLS((db: any) =>
        db.delete(documentFolders)
          .where(eq(documentFolders.id, id))
      )

      return NextResponse.json({
        success: true,
        message: 'Folder permanently deleted',
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid type parameter' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('DELETE /api/modules/documents/trash/empty error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
