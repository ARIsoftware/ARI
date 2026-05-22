/**
 * Documents Module - Individual Folder API Routes
 *
 * Endpoints:
 * - PATCH /api/modules/documents/folders/[id] - Update folder
 * - DELETE /api/modules/documents/folders/[id] - Delete folder (moves to trash)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { documentFolders, documents } from '@/lib/db/schema'
import { eq, and, isNull, inArray, sql } from 'drizzle-orm'
import { FOLDER_NAME_PATTERN, FOLDER_NAME_MAX_LENGTH } from '../../../lib/utils'

const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(FOLDER_NAME_MAX_LENGTH).regex(
    FOLDER_NAME_PATTERN,
    'Folder name may only contain letters, numbers, hyphens, and underscores'
  ).optional(),
  parent_id: z.string().uuid().nullable().optional(),
})

/**
 * PATCH Handler - Update folder
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

    const validation = await validateRequestBody(request, UpdateFolderSchema)
    if (!validation.success) return validation.response

    const { name, parent_id } = validation.data

    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === id) {
        return createErrorResponse('Cannot move folder into itself', 400)
      }

      // Verify parent exists AND that `id` isn't anywhere in its ancestor chain
      // (would create a cycle). One recursive CTE walks the chain in a single
      // round-trip; bails as soon as it finds `id`.
      const ancestors = await withRLS((db: any) =>
        db.execute(sql`
          WITH RECURSIVE ancestors(id, parent_id, depth) AS (
            SELECT id, parent_id, 0
              FROM document_folders
             WHERE id = ${parent_id}
               AND user_id = ${user.id}
               AND deleted_at IS NULL
            UNION ALL
            SELECT df.id, df.parent_id, a.depth + 1
              FROM document_folders df
              JOIN ancestors a ON df.id = a.parent_id
             WHERE df.user_id = ${user.id}
               AND a.depth < 100
          )
          SELECT id FROM ancestors
        `)
      )
      const ancestorRows: any[] = Array.isArray(ancestors)
        ? ancestors
        : ((ancestors as any).rows ?? [])

      if (ancestorRows.length === 0) {
        return createErrorResponse('Parent folder not found', 404)
      }
      if (ancestorRows.some((r) => r.id === id)) {
        return createErrorResponse('Cannot move folder into its own descendant', 400)
      }
    }

    const updateData: any = {
      updatedAt: sql`timezone('utc'::text, now())`,
    }
    if (name !== undefined) updateData.name = name
    if (parent_id !== undefined) updateData.parentId = parent_id

    const updated = await withRLS((db: any) =>
      db.update(documentFolders)
        .set(updateData)
        .where(and(
          eq(documentFolders.id, id),
          eq(documentFolders.userId, user.id),
          isNull(documentFolders.deletedAt)
        ))
        .returning()
    )

    if (updated.length === 0) {
      return createErrorResponse('Folder not found', 404)
    }

    return NextResponse.json({
      folder: toSnakeCase(updated[0]),
    })

  } catch (error) {
    console.error('PATCH /api/modules/documents/folders/[id] error:', error)
    return createErrorResponse('Internal server error')
  }
}

/**
 * DELETE Handler - Soft delete folder and its contents
 */
export async function DELETE(
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

    // Verify folder exists and belongs to user
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documentFolders)
        .where(and(
          eq(documentFolders.id, id),
          eq(documentFolders.userId, user.id)
        ))
        .limit(1)
    )

    if (existing.length === 0) {
      return createErrorResponse('Folder not found', 404)
    }

    const deletedAt = sql`timezone('utc'::text, now())`

    // Collect the target folder + every descendant via a single recursive CTE,
    // replacing the previous one-query-per-folder traversal. RLS still applies
    // because withRLS sets app.current_user_id for the whole transaction.
    const descendantRows = await withRLS((db: any) =>
      db.execute(sql`
        WITH RECURSIVE descendants(id) AS (
          SELECT ${id}::uuid
          UNION ALL
          SELECT df.id
            FROM document_folders df
            JOIN descendants d ON df.parent_id = d.id
           WHERE df.user_id = ${user.id}
        )
        SELECT id FROM descendants
      `)
    )

    // db.execute returns either an array of rows or a result-like object
    // depending on the driver shape; normalize.
    const rowsArr: any[] = Array.isArray(descendantRows)
      ? descendantRows
      : ((descendantRows as any).rows ?? [])
    const allFolderIds: string[] = rowsArr.map((r) => r.id)

    if (allFolderIds.length > 0) {
      // Single batched soft-delete of every document inside these folders.
      await withRLS((db: any) =>
        db.update(documents)
          .set({ deletedAt, updatedAt: deletedAt })
          .where(and(
            eq(documents.userId, user.id),
            inArray(documents.folderId, allFolderIds)
          ))
      )

      // Single batched soft-delete of the folders themselves.
      await withRLS((db: any) =>
        db.update(documentFolders)
          .set({ deletedAt, updatedAt: deletedAt })
          .where(and(
            eq(documentFolders.userId, user.id),
            inArray(documentFolders.id, allFolderIds)
          ))
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Folder and contents moved to trash',
      folders_affected: allFolderIds.length,
    })

  } catch (error) {
    console.error('DELETE /api/modules/documents/folders/[id] error:', error)
    return createErrorResponse('Internal server error')
  }
}
