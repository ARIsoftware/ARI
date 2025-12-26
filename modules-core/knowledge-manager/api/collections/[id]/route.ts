/**
 * Knowledge Manager Module - Individual Collection API Routes
 *
 * Endpoints:
 * - PATCH  /api/modules/knowledge-manager/collections/[id]  - Update collection
 * - DELETE /api/modules/knowledge-manager/collections/[id]  - Delete collection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { knowledgeCollections } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Validation Schema for PATCH requests
 */
const UpdateCollectionSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .optional(),
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
    .optional(),
  icon: z.string()
    .max(50)
    .optional(),
  sort_order: z.number().int().min(0).optional()
})

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * PATCH Handler - Update a collection
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parseResult = UpdateCollectionSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}

    // Map API fields to Drizzle column names
    if (parseResult.data.name !== undefined) {
      updateData.name = parseResult.data.name
    }
    if (parseResult.data.color !== undefined) {
      updateData.color = parseResult.data.color
    }
    if (parseResult.data.icon !== undefined) {
      updateData.icon = parseResult.data.icon
    }
    if (parseResult.data.sort_order !== undefined) {
      updateData.sortOrder = parseResult.data.sort_order
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // RLS automatically ensures user can only update their own collections
    const collection = await withRLS((db) =>
      db.update(knowledgeCollections)
        .set(updateData)
        .where(eq(knowledgeCollections.id, id))
        .returning()
    )

    if (collection.length === 0) {
      return NextResponse.json(
        { error: 'Collection not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({ collection: toSnakeCase(collection[0]) })

  } catch (error) {
    console.error('PATCH /api/modules/knowledge-manager/collections/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete a collection
 *
 * Note: Articles in this collection will have collection_id set to NULL (ON DELETE SET NULL)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    // RLS automatically ensures user can only delete their own collections
    await withRLS((db) =>
      db.delete(knowledgeCollections)
        .where(eq(knowledgeCollections.id, id))
    )

    return NextResponse.json({
      success: true,
      message: 'Collection deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/modules/knowledge-manager/collections/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
