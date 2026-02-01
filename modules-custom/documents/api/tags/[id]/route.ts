/**
 * Documents Module - Individual Tag API Routes
 *
 * Endpoints:
 * - PATCH /api/modules/documents/tags/[id] - Update tag
 * - DELETE /api/modules/documents/tags/[id] - Delete tag
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
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
    const parseResult = UpdateTagSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { name, color } = parseResult.data

    // Verify tag exists
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documentTags)
        .where(eq(documentTags.id, id))
        .limit(1)
    )

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      )
    }

    // If renaming, check that new name doesn't conflict
    if (name && name !== existing[0].name) {
      const nameConflict = await withRLS((db: any) =>
        db.select()
          .from(documentTags)
          .where(and(
            eq(documentTags.name, name),
            ne(documentTags.id, id)
          ))
          .limit(1)
      )
      if (nameConflict.length > 0) {
        return NextResponse.json(
          { error: 'A tag with this name already exists' },
          { status: 409 }
        )
      }
    }

    // Build update object
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (color !== undefined) updateData.color = color

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // Update tag
    const updated = await withRLS((db: any) =>
      db.update(documentTags)
        .set(updateData)
        .where(eq(documentTags.id, id))
        .returning()
    )

    return NextResponse.json({
      tag: toSnakeCase(updated[0]),
    })

  } catch (error) {
    console.error('PATCH /api/modules/documents/tags/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete tag (cascade removes assignments)
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

    // Verify tag exists
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documentTags)
        .where(eq(documentTags.id, id))
        .limit(1)
    )

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      )
    }

    // Delete tag (cascade will remove assignments)
    await withRLS((db: any) =>
      db.delete(documentTags)
        .where(eq(documentTags.id, id))
    )

    return NextResponse.json({
      success: true,
      message: 'Tag deleted successfully',
    })

  } catch (error) {
    console.error('DELETE /api/modules/documents/tags/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
