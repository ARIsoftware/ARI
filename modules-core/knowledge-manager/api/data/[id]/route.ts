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
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { knowledgeArticles, knowledgeCollections } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

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

    // RLS filters automatically
    const article = await withRLS((db) =>
      db.select({
        id: knowledgeArticles.id,
        userId: knowledgeArticles.userId,
        title: knowledgeArticles.title,
        content: knowledgeArticles.content,
        tags: knowledgeArticles.tags,
        collectionId: knowledgeArticles.collectionId,
        status: knowledgeArticles.status,
        isFavorite: knowledgeArticles.isFavorite,
        isDeleted: knowledgeArticles.isDeleted,
        deletedAt: knowledgeArticles.deletedAt,
        createdAt: knowledgeArticles.createdAt,
        updatedAt: knowledgeArticles.updatedAt,
        collection: {
          id: knowledgeCollections.id,
          name: knowledgeCollections.name,
          color: knowledgeCollections.color,
          icon: knowledgeCollections.icon,
        }
      })
      .from(knowledgeArticles)
      .leftJoin(knowledgeCollections, eq(knowledgeArticles.collectionId, knowledgeCollections.id))
      .where(eq(knowledgeArticles.id, id))
      .limit(1)
    )

    if (article.length === 0) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ article: toSnakeCase(article[0]) })

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

    const updateData: Record<string, unknown> = {}

    // Map API fields to Drizzle column names
    if (parseResult.data.title !== undefined) {
      updateData.title = parseResult.data.title
    }
    if (parseResult.data.content !== undefined) {
      updateData.content = parseResult.data.content
    }
    if (parseResult.data.tags !== undefined) {
      updateData.tags = parseResult.data.tags
    }
    if (parseResult.data.collection_id !== undefined) {
      updateData.collectionId = parseResult.data.collection_id
    }
    if (parseResult.data.status !== undefined) {
      updateData.status = parseResult.data.status
    }
    if (parseResult.data.is_favorite !== undefined) {
      updateData.isFavorite = parseResult.data.is_favorite
    }

    // Handle soft delete - set deleted_at timestamp
    if (parseResult.data.is_deleted === true) {
      updateData.isDeleted = true
      updateData.deletedAt = sql`timezone('utc'::text, now())`
    } else if (parseResult.data.is_deleted === false) {
      updateData.isDeleted = false
      updateData.deletedAt = null
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // RLS automatically ensures user can only update their own articles
    await withRLS((db) =>
      db.update(knowledgeArticles)
        .set(updateData)
        .where(eq(knowledgeArticles.id, id))
    )

    // Fetch updated article with collection
    const article = await withRLS((db) =>
      db.select({
        id: knowledgeArticles.id,
        userId: knowledgeArticles.userId,
        title: knowledgeArticles.title,
        content: knowledgeArticles.content,
        tags: knowledgeArticles.tags,
        collectionId: knowledgeArticles.collectionId,
        status: knowledgeArticles.status,
        isFavorite: knowledgeArticles.isFavorite,
        isDeleted: knowledgeArticles.isDeleted,
        deletedAt: knowledgeArticles.deletedAt,
        createdAt: knowledgeArticles.createdAt,
        updatedAt: knowledgeArticles.updatedAt,
        collection: {
          id: knowledgeCollections.id,
          name: knowledgeCollections.name,
          color: knowledgeCollections.color,
          icon: knowledgeCollections.icon,
        }
      })
      .from(knowledgeArticles)
      .leftJoin(knowledgeCollections, eq(knowledgeArticles.collectionId, knowledgeCollections.id))
      .where(eq(knowledgeArticles.id, id))
      .limit(1)
    )

    if (article.length === 0) {
      return NextResponse.json(
        { error: 'Article not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({ article: toSnakeCase(article[0]) })

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

    const { searchParams } = new URL(request.url)
    const permanent = searchParams.get('permanent') === 'true'

    if (permanent) {
      // Hard delete - RLS automatically ensures user can only delete their own
      await withRLS((db) =>
        db.delete(knowledgeArticles)
          .where(eq(knowledgeArticles.id, id))
      )

      return NextResponse.json({
        success: true,
        message: 'Article permanently deleted'
      })
    } else {
      // Soft delete - move to trash
      await withRLS((db) =>
        db.update(knowledgeArticles)
          .set({
            isDeleted: true,
            deletedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(knowledgeArticles.id, id))
      )

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
