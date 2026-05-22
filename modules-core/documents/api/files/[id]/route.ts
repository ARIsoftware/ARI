/**
 * Documents Module - Individual File API Routes
 *
 * Endpoints:
 * - PATCH /api/modules/documents/files/[id] - Update file (rename, move, tag)
 * - DELETE /api/modules/documents/files/[id] - Soft delete file (move to trash)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { documents, documentFolders, documentTags, documentTagAssignments } from '@/lib/db/schema'
import { eq, and, isNull, inArray, sql } from 'drizzle-orm'

const UpdateDocumentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folder_id: z.string().uuid().nullable().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
})

/**
 * PATCH Handler - Update file properties
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { id } = await params

    if (!z.string().uuid().safeParse(id).success) {
      return createErrorResponse('Invalid ID format', 400)
    }

    const validation = await validateRequestBody(request, UpdateDocumentSchema)
    if (!validation.success) return validation.response

    const { name, folder_id, tag_ids } = validation.data

    // Verify folder exists before attempting the update so we 404 cleanly.
    if (folder_id !== undefined && folder_id !== null) {
      const folder = await withRLS((db) =>
        db.select({ id: documentFolders.id })
          .from(documentFolders)
          .where(and(
            eq(documentFolders.id, folder_id),
            eq(documentFolders.userId, user.id),
            isNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )
      if (folder.length === 0) {
        return createErrorResponse('Target folder not found', 404)
      }
    }

    if (tag_ids !== undefined && tag_ids.length > 0) {
      const ownedTags = await withRLS((db) =>
        db.select({ id: documentTags.id })
          .from(documentTags)
          .where(and(
            eq(documentTags.userId, user.id),
            inArray(documentTags.id, tag_ids)
          ))
      )
      if (ownedTags.length !== tag_ids.length) {
        return createErrorResponse('One or more tags do not exist', 400)
      }
    }

    const updateData: any = {
      updatedAt: sql`timezone('utc'::text, now())`,
    }
    if (name !== undefined) updateData.name = name
    if (folder_id !== undefined) updateData.folderId = folder_id

    const updated = await withRLS((db) =>
      db.update(documents)
        .set(updateData)
        .where(and(
          eq(documents.id, id),
          eq(documents.userId, user.id),
          isNull(documents.deletedAt)
        ))
        .returning()
    )

    if (updated.length === 0) {
      return createErrorResponse('Document not found', 404)
    }

    // Handle tag assignments if provided. DELETE + INSERT must share a
    // transaction so a failed insert rolls back the delete — withRLS wraps
    // the whole callback in BEGIN/COMMIT.
    if (tag_ids !== undefined) {
      await withRLS(async (db) => {
        await db.delete(documentTagAssignments)
          .where(eq(documentTagAssignments.documentId, id))
        if (tag_ids.length > 0) {
          const tagAssignmentValues = tag_ids.map((tagId) => ({
            userId: user.id,
            documentId: id,
            tagId,
          }))
          await db.insert(documentTagAssignments)
            .values(tagAssignmentValues)
        }
      })
    }

    return NextResponse.json({
      document: toSnakeCase(updated[0]),
    })

  } catch (error) {
    console.error('PATCH /api/modules/documents/files/[id] error:', error)
    return createErrorResponse('Internal server error')
  }
}

/**
 * DELETE Handler - Soft delete file (move to trash)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { id } = await params

    if (!z.string().uuid().safeParse(id).success) {
      return createErrorResponse('Invalid ID format', 400)
    }

    // Single soft-delete; the WHERE filters are the ownership check.
    const deleted = await withRLS((db) =>
      db.update(documents)
        .set({
          deletedAt: sql`timezone('utc'::text, now())`,
          updatedAt: sql`timezone('utc'::text, now())`,
        })
        .where(and(
          eq(documents.id, id),
          eq(documents.userId, user.id),
          isNull(documents.deletedAt)
        ))
        .returning({ id: documents.id })
    )

    if (deleted.length === 0) {
      return createErrorResponse('Document not found', 404)
    }

    return NextResponse.json({
      success: true,
      message: 'Document moved to trash',
    })

  } catch (error) {
    console.error('DELETE /api/modules/documents/files/[id] error:', error)
    return createErrorResponse('Internal server error')
  }
}
