/**
 * Knowledge Manager Module - Data API Routes
 *
 * Endpoints:
 * - GET    /api/modules/knowledge-manager/data       - List articles with filters
 * - POST   /api/modules/knowledge-manager/data       - Create new article
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { safeErrorResponse } from '@/lib/api-error'
import { z } from 'zod'
import {
  createArticleSchema,
  listArticlesQuerySchema,
  ArticleListResponseSchema,
  ArticleSingleResponseSchema,
} from '@/modules/knowledge-manager/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { knowledgeArticles, knowledgeCollections } from '@/lib/db/schema'
import { eq, desc, asc, ilike, or, and, sql, arrayContains } from 'drizzle-orm'
import type { TagWithCount } from '../../types'

// Apply normalization transform at runtime (kept separate from OpenAPI schema
// so the spec describes the raw input shape, not the post-transform shape).
const CreateArticleSchema = createArticleSchema.extend({
  tags: z.array(z.string().max(50))
    .default([])
    .transform(tags =>
      [...new Set(tags.map(tag => tag.toLowerCase().trim().replace(/^#/, '')))]
        .filter(tag => tag.length > 0)
    ),
})

registry.registerPath({
  method: 'get',
  path: '/api/modules/knowledge-manager/data',
  operationId: 'listKnowledgeArticles',
  summary: 'List knowledge articles with filters, search, and tag counts',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: { query: listArticlesQuerySchema },
  responses: {
    200: { description: 'Articles, total count, and tag histogram', content: { 'application/json': { schema: ArticleListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/knowledge-manager/data',
  operationId: 'createKnowledgeArticle',
  summary: 'Create a knowledge article (tags get normalized: lowercased, deduped, stripped of leading #)',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: createArticleSchema } } } },
  responses: {
    201: { description: 'Created article (with joined collection ref)', content: { 'application/json': { schema: ArticleSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * GET Handler - Fetch articles with filtering and search
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const validation = validateQueryParams(searchParams, listArticlesQuerySchema)
    if (!validation.success) {
      return validation.response
    }
    const query = validation.data

    const sortBy = query.sort_by || 'updated_at'
    const sortDir = query.sort_dir || 'desc'
    const limit = query.limit ?? 200
    const offset = query.offset ?? 0

    // Build SQL WHERE conditions. The explicit user_id predicate is mandatory:
    // the default Postgres role has BYPASSRLS, so RLS policies are NOT a
    // sufficient tenant boundary on their own (see docs/SECURITY.md).
    const conditions = [
      eq(knowledgeArticles.userId, user.id),
      query.is_deleted === 'true'
        ? eq(knowledgeArticles.isDeleted, true)
        : eq(knowledgeArticles.isDeleted, false)
    ]

    if (query.collection_id) {
      conditions.push(eq(knowledgeArticles.collectionId, query.collection_id))
    }
    if (query.status === 'draft' || query.status === 'published') {
      conditions.push(eq(knowledgeArticles.status, query.status))
    }
    if (query.is_favorite === 'true') {
      conditions.push(eq(knowledgeArticles.isFavorite, true))
    }
    if (query.tag) {
      const normalizedTag = query.tag.toLowerCase().trim().replace(/^#/, '')
      conditions.push(arrayContains(knowledgeArticles.tags, [normalizedTag]))
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(knowledgeArticles.title, `%${query.search}%`),
          ilike(knowledgeArticles.content, `%${query.search}%`)
        )!
      )
    }

    // True total count for the current filter set (ignores limit/offset so the
    // sidebar badges reflect the real number, not the capped page length).
    const [{ total }] = await withRLS(async (db) =>
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(knowledgeArticles)
        .where(and(...conditions))
    )

    // Lightweight path: the nav counts only need the total, so skip the row
    // fetch + join + tag aggregation entirely.
    if (query.count_only === 'true') {
      return NextResponse.json({ articles: [], count: total, allTags: [] })
    }

    // Determine sort column and direction
    const sortColumn = sortBy === 'title'
      ? knowledgeArticles.title
      : sortBy === 'created_at'
        ? knowledgeArticles.createdAt
        : knowledgeArticles.updatedAt
    const orderBy = sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn)

    // Fetch articles with collection join
    const articles = await withRLS(async (db) =>
      db
        .select({
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
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset)
    )

    // Tag histogram over the user's non-deleted articles, aggregated in the DB
    // (unnest + GROUP BY) so we don't pull every row into memory.
    const tagRows = await withRLS(async (db) =>
      db.execute(sql`
        SELECT t AS name, count(*)::int AS count
          FROM ${knowledgeArticles}, unnest(${knowledgeArticles.tags}) AS t
         WHERE ${knowledgeArticles.userId} = ${user.id}
           AND ${knowledgeArticles.isDeleted} = false
         GROUP BY t
         ORDER BY count DESC, name ASC
      `)
    )
    const allTags: TagWithCount[] = (Array.isArray(tagRows) ? tagRows : ((tagRows as { rows?: unknown[] }).rows ?? []))
      .map((r) => r as { name: string; count: number })

    return NextResponse.json({
      articles: toSnakeCase(articles) || [],
      count: total,
      allTags
    })

  } catch (error) {
    console.error('GET /api/modules/knowledge-manager/data error:', safeErrorResponse(error))
    return createErrorResponse('Internal server error', 500)
  }
}

/**
 * POST Handler - Create a new article
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parseResult = CreateArticleSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { title, content, tags, collection_id, status, is_favorite } = parseResult.data

    // INSERT requires explicit user_id
    const articleData = await withRLS((db) =>
      db.insert(knowledgeArticles)
        .values({
          userId: user.id,
          title,
          content,
          tags,
          collectionId: collection_id || null,
          status,
          isFavorite: is_favorite,
          isDeleted: false
        })
        .returning()
    )

    // Fetch with collection data
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
        eq(knowledgeArticles.id, articleData[0].id),
        eq(knowledgeArticles.userId, user.id)
      ))
      .limit(1)
    )

    return NextResponse.json(
      { article: toSnakeCase(article[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/knowledge-manager/data error:', safeErrorResponse(error))
    return createErrorResponse('Internal server error', 500)
  }
}
