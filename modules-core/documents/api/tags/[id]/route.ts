/**
 * Documents Module - Individual Tag API Routes
 *
 * Endpoints:
 * - PATCH /api/modules/documents/tags/[id] - Update tag
 * - DELETE /api/modules/documents/tags/[id] - Delete tag
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { documentTags } from '@/lib/db/schema'
import { eq, and, ne, sql } from 'drizzle-orm'

const UpdateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
})

/**
 * PATCH Handler - Update tag
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

    const validation = await validateRequestBody(request, UpdateTagSchema)
    if (!validation.success) return validation.response

    const { name, color } = validation.data

    // Verify tag exists and belongs to user
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documentTags)
        .where(and(
          eq(documentTags.id, id),
          eq(documentTags.userId, user.id)
        ))
        .limit(1)
    )

    if (existing.length === 0) {
      return createErrorResponse('Tag not found', 404)
    }

    // If renaming, check that new name doesn't conflict among this user's tags
    if (name && name !== existing[0].name) {
      const nameConflict = await withRLS((db: any) =>
        db.select()
          .from(documentTags)
          .where(and(
            eq(documentTags.userId, user.id),
            eq(documentTags.name, name),
            ne(documentTags.id, id)
          ))
          .limit(1)
      )
      if (nameConflict.length > 0) {
        return createErrorResponse('A tag with this name already exists', 409)
      }
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (color !== undefined) updateData.color = color

    if (Object.keys(updateData).length === 0) {
      return createErrorResponse('No fields to update', 400)
    }

    // Update tag
    const updated = await withRLS((db: any) =>
      db.update(documentTags)
        .set(updateData)
        .where(and(eq(documentTags.id, id), eq(documentTags.userId, user.id)))
        .returning()
    )

    return NextResponse.json({
      tag: toSnakeCase(updated[0]),
    })

  } catch (error) {
    console.error('PATCH /api/modules/documents/tags/[id] error:', error)
    return createErrorResponse('Internal server error')
  }
}

/**
 * DELETE Handler - Delete tag (cascade removes assignments)
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

    // Cascade will remove assignments. Returning gives us the rowcount for 404.
    const deleted = await withRLS((db: any) =>
      db.delete(documentTags)
        .where(and(eq(documentTags.id, id), eq(documentTags.userId, user.id)))
        .returning({ id: documentTags.id })
    )

    if (deleted.length === 0) {
      return createErrorResponse('Tag not found', 404)
    }

    return NextResponse.json({
      success: true,
      message: 'Tag deleted successfully',
    })

  } catch (error) {
    console.error('DELETE /api/modules/documents/tags/[id] error:', error)
    return createErrorResponse('Internal server error')
  }
}
