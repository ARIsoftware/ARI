/**
 * Knowledge Manager Module - Individual Collection API Routes
 *
 * Endpoints:
 * - PATCH  /api/modules/knowledge-manager/collections/[id]  - Update collection
 * - DELETE /api/modules/knowledge-manager/collections/[id]  - Delete collection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    const updateData = parseResult.data

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data: collection, error: dbError } = await supabase
      .from('knowledge_collections')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (dbError || !collection) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Collection not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({ collection })

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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    const { error: dbError } = await supabase
      .from('knowledge_collections')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to delete collection' },
        { status: 500 }
      )
    }

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
