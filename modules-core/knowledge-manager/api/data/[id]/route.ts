/**
 * Knowledge Manager Module - Individual Article API Routes
 *
 * Endpoints:
 * - GET    /api/modules/knowledge-manager/data/[id]  - Get single article
 * - PATCH  /api/modules/knowledge-manager/data/[id]  - Update article
 * - DELETE /api/modules/knowledge-manager/data/[id]  - Delete article (soft or permanent)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

/**
 * Validation Schema for PATCH requests
 */
const UpdateArticleSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters')
    .optional(),
  content: z.string().optional(),
  tags: z.array(z.string().max(50))
    .transform(tags =>
      [...new Set(tags.map(tag => tag.toLowerCase().trim().replace(/^#/, '')))]
        .filter(tag => tag.length > 0)
    )
    .optional(),
  collection_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  is_favorite: z.boolean().optional(),
  is_deleted: z.boolean().optional()
})

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET Handler - Fetch a single article by ID
 */
export async function GET(
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

    const { data: article, error: dbError } = await supabase
      .from('knowledge_articles')
      .select(`
        *,
        collection:knowledge_collections(id, name, color, icon)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (dbError || !article) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ article })

  } catch (error) {
    console.error('GET /api/modules/knowledge-manager/data/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH Handler - Update an article
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
    const parseResult = UpdateArticleSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = { ...parseResult.data }

    // Handle soft delete - set deleted_at timestamp
    if (updateData.is_deleted === true) {
      updateData.deleted_at = new Date().toISOString()
    } else if (updateData.is_deleted === false) {
      updateData.deleted_at = null
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data: article, error: dbError } = await supabase
      .from('knowledge_articles')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(`
        *,
        collection:knowledge_collections(id, name, color, icon)
      `)
      .single()

    if (dbError || !article) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Article not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({ article })

  } catch (error) {
    console.error('PATCH /api/modules/knowledge-manager/data/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Permanently delete an article
 *
 * Query params:
 * - permanent=true: Hard delete (default: false, uses soft delete via PATCH)
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

    const { searchParams } = new URL(request.url)
    const permanent = searchParams.get('permanent') === 'true'

    if (permanent) {
      // Hard delete
      const { error: dbError } = await supabase
        .from('knowledge_articles')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (dbError) {
        console.error('Database error:', dbError)
        return NextResponse.json(
          { error: 'Failed to delete article' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Article permanently deleted'
      })
    } else {
      // Soft delete - move to trash
      const { error: dbError } = await supabase
        .from('knowledge_articles')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', user.id)

      if (dbError) {
        console.error('Database error:', dbError)
        return NextResponse.json(
          { error: 'Failed to delete article' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Article moved to trash'
      })
    }

  } catch (error) {
    console.error('DELETE /api/modules/knowledge-manager/data/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
