/**
 * Documents Module - Individual Folder API Routes
 *
 * Endpoints:
 * - PATCH /api/modules/documents/folders/[id] - Update folder
 * - DELETE /api/modules/documents/folders/[id] - Delete folder (moves to trash)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { documentFolders, documents } from '@/lib/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'

const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parseResult = UpdateFolderSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { name, parent_id } = parseResult.data

    // Verify folder exists
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documentFolders)
        .where(and(
          eq(documentFolders.id, id),
          isNull(documentFolders.deletedAt)
        ))
        .limit(1)
    )

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Folder not found' },
        { status: 404 }
      )
    }

    // Prevent moving folder into itself or its descendants
    if (parent_id !== undefined && parent_id !== null) {
      // Can't set parent to self
      if (parent_id === id) {
        return NextResponse.json(
          { error: 'Cannot move folder into itself' },
          { status: 400 }
        )
      }

      // Verify parent exists
      const parent = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.id, parent_id),
            isNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )
      if (parent.length === 0) {
        return NextResponse.json(
          { error: 'Parent folder not found' },
          { status: 404 }
        )
      }

      // Check if parent_id is a descendant of current folder (would create circular reference)
      // Simple check - traverse up from parent_id to see if we hit the current folder
      let currentParent = parent[0]
      while (currentParent.parentId) {
        if (currentParent.parentId === id) {
          return NextResponse.json(
            { error: 'Cannot move folder into its own descendant' },
            { status: 400 }
          )
        }
        const nextParent = await withRLS((db: any) =>
          db.select()
            .from(documentFolders)
            .where(eq(documentFolders.id, currentParent.parentId))
            .limit(1)
        )
        if (nextParent.length === 0) break
        currentParent = nextParent[0]
      }
    }

    // Build update object
    const updateData: any = {
      updatedAt: sql`timezone('utc'::text, now())`,
    }
    if (name !== undefined) updateData.name = name
    if (parent_id !== undefined) updateData.parentId = parent_id

    // Update folder
    const updated = await withRLS((db: any) =>
      db.update(documentFolders)
        .set(updateData)
        .where(eq(documentFolders.id, id))
        .returning()
    )

    return NextResponse.json({
      folder: toSnakeCase(updated[0]),
    })

  } catch (error) {
    console.error('PATCH /api/modules/documents/folders/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const permanent = searchParams.get('permanent') === 'true'

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    // Verify folder exists
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documentFolders)
        .where(eq(documentFolders.id, id))
        .limit(1)
    )

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Folder not found' },
        { status: 404 }
      )
    }

    const deletedAt = sql`timezone('utc'::text, now())`

    // Recursively collect all descendant folder IDs
    const getAllDescendantFolderIds = async (folderId: string): Promise<string[]> => {
      const children = await withRLS((db: any) =>
        db.select({ id: documentFolders.id })
          .from(documentFolders)
          .where(eq(documentFolders.parentId, folderId))
      )

      const childIds = children.map((c: any) => c.id)
      const descendantIds: string[] = [...childIds]

      for (const childId of childIds) {
        const grandchildren = await getAllDescendantFolderIds(childId)
        descendantIds.push(...grandchildren)
      }

      return descendantIds
    }

    const descendantIds = await getAllDescendantFolderIds(id)
    const allFolderIds = [id, ...descendantIds]

    // Soft delete all folders and their documents
    for (const folderId of allFolderIds) {
      // Soft delete documents in this folder
      await withRLS((db: any) =>
        db.update(documents)
          .set({ deletedAt, updatedAt: deletedAt })
          .where(eq(documents.folderId, folderId))
      )

      // Soft delete the folder
      await withRLS((db: any) =>
        db.update(documentFolders)
          .set({ deletedAt, updatedAt: deletedAt })
          .where(eq(documentFolders.id, folderId))
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Folder and contents moved to trash',
      folders_affected: allFolderIds.length,
    })

  } catch (error) {
    console.error('DELETE /api/modules/documents/folders/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
