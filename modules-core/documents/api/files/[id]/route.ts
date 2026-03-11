/**
 * Documents Module - Individual File API Routes
 *
 * Endpoints:
 * - PATCH /api/modules/documents/files/[id] - Update file (rename, move, tag)
 * - DELETE /api/modules/documents/files/[id] - Soft delete file (move to trash)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { documents, documentFolders, documentTagAssignments } from '@/lib/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'

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
    const parseResult = UpdateDocumentSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { name, folder_id, tag_ids } = parseResult.data

    // Verify document exists and belongs to user
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documents)
        .where(and(
          eq(documents.id, id),
          isNull(documents.deletedAt)
        ))
        .limit(1)
    )

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Verify folder exists if moving to a new folder
    if (folder_id !== undefined && folder_id !== null) {
      const folder = await withRLS((db: any) =>
        db.select()
          .from(documentFolders)
          .where(and(
            eq(documentFolders.id, folder_id),
            isNull(documentFolders.deletedAt)
          ))
          .limit(1)
      )
      if (folder.length === 0) {
        return NextResponse.json(
          { error: 'Target folder not found' },
          { status: 404 }
        )
      }
    }

    // Build update object
    const updateData: any = {
      updatedAt: sql`timezone('utc'::text, now())`,
    }
    if (name !== undefined) updateData.name = name
    if (folder_id !== undefined) updateData.folderId = folder_id

    // Update document
    const updated = await withRLS((db: any) =>
      db.update(documents)
        .set(updateData)
        .where(eq(documents.id, id))
        .returning()
    )

    // Handle tag assignments if provided
    if (tag_ids !== undefined) {
      // Remove existing assignments
      await withRLS((db: any) =>
        db.delete(documentTagAssignments)
          .where(eq(documentTagAssignments.documentId, id))
      )

      // Add new assignments
      if (tag_ids.length > 0) {
        const tagAssignmentValues = tag_ids.map((tagId) => ({
          documentId: id,
          tagId,
        }))
        await withRLS((db: any) =>
          db.insert(documentTagAssignments)
            .values(tagAssignmentValues)
        )
      }
    }

    return NextResponse.json({
      document: toSnakeCase(updated[0]),
    })

  } catch (error) {
    console.error('PATCH /api/modules/documents/files/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Soft delete file (move to trash)
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

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    // Verify document exists
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documents)
        .where(and(
          eq(documents.id, id),
          isNull(documents.deletedAt)
        ))
        .limit(1)
    )

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Soft delete (set deletedAt timestamp)
    await withRLS((db: any) =>
      db.update(documents)
        .set({
          deletedAt: sql`timezone('utc'::text, now())`,
          updatedAt: sql`timezone('utc'::text, now())`,
        })
        .where(eq(documents.id, id))
    )

    return NextResponse.json({
      success: true,
      message: 'Document moved to trash',
    })

  } catch (error) {
    console.error('DELETE /api/modules/documents/files/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
