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
import { toSnakeCase, createErrorResponse } from '@/lib/api-helpers'
import { safeErrorResponse } from '@/lib/api-error'
import { z } from 'zod'
import {
  updateArticleSchema,
  articleIdParamSchema,
  deleteArticleQuerySchema,
  ArticleSingleResponseSchema,
  ArticleDeleteResponseSchema,
} from '@/modules/knowledge-manager/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { knowledgeArticles, knowledgeCollections } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

// Runtime schema adds tag normalization transform that the OpenAPI schema omits
// so the spec describes the raw input shape.
const UpdateArticleSchema = updateArticleSchema.extend({
  tags: z.array(z.string().max(50))
    .transform(tags =>
      [...new Set(tags.map(tag => tag.toLowerCase().trim().replace(/^#/, '')))]
        .filter(tag => tag.length > 0)
    )
    .optional(),
})

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

registry.registerPath({
  method: 'get',
  path: '/api/modules/knowledge-manager/data/{id}',
  operationId: 'getKnowledgeArticle',
  summary: 'Get a single article by id (with joined collection ref)',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: { params: articleIdParamSchema },
  responses: {
    200: { description: 'Article', content: { 'application/json': { schema: ArticleSingleResponseSchema } } },
    400: { description: 'Invalid id format', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Article not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/modules/knowledge-manager/data/{id}',
  operationId: 'updateKnowledgeArticle',
  summary: 'Update an article. Tags get normalized when present.',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: {
    params: articleIdParamSchema,
    body: { content: { 'application/json': { schema: updateArticleSchema } } },
  },
  responses: {
    200: { description: 'Updated article (with joined collection ref)', content: { 'application/json': { schema: ArticleSingleResponseSchema } } },
    400: { description: 'Validation error, invalid id, or no fields to update', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Article not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/knowledge-manager/data/{id}',
  operationId: 'deleteKnowledgeArticle',
  summary: 'Delete an article. Default is soft delete (moves to trash); ?permanent=true hard-deletes.',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: {
    params: articleIdParamSchema,
    query: deleteArticleQuerySchema,
  },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: ArticleDeleteResponseSchema } } },
    400: { description: 'Invalid id format', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

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

    // Explicit user_id filter is mandatory (BYPASSRLS — see docs/SECURITY.md)
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
      .where(and(
        eq(knowledgeArticles.id, id),
        eq(knowledgeArticles.userId, user.id)
      ))
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
    console.error('GET /api/modules/knowledge-manager/data/[id] error:', safeErrorResponse(error))
    return createErrorResponse('Internal server error', 500)
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

    // Explicit user_id filter is mandatory (BYPASSRLS — see docs/SECURITY.md)
    await withRLS((db) =>
      db.update(knowledgeArticles)
        .set(updateData)
        .where(and(
          eq(knowledgeArticles.id, id),
          eq(knowledgeArticles.userId, user.id)
        ))
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
      .where(and(
        eq(knowledgeArticles.id, id),
        eq(knowledgeArticles.userId, user.id)
      ))
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
    console.error('PATCH /api/modules/knowledge-manager/data/[id] error:', safeErrorResponse(error))
    return createErrorResponse('Internal server error', 500)
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

    // Explicit user_id filter is mandatory (BYPASSRLS — see docs/SECURITY.md)
    if (permanent) {
      // Hard delete
      await withRLS((db) =>
        db.delete(knowledgeArticles)
          .where(and(
            eq(knowledgeArticles.id, id),
            eq(knowledgeArticles.userId, user.id)
          ))
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
          .where(and(
            eq(knowledgeArticles.id, id),
            eq(knowledgeArticles.userId, user.id)
          ))
      )

      return NextResponse.json({
        success: true,
        message: 'Article moved to trash'
      })
    }

  } catch (error) {
    console.error('DELETE /api/modules/knowledge-manager/data/[id] error:', safeErrorResponse(error))
    return createErrorResponse('Internal server error', 500)
  }
}
