/**
 * Knowledge Manager Module - Data API Routes
 *
 * Endpoints:
 * - GET    /api/modules/knowledge-manager/data       - List articles with filters
 * - POST   /api/modules/knowledge-manager/data       - Create new article
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { knowledgeArticles, knowledgeCollections } from '@/lib/db/schema'
import { eq, desc, asc, ilike, or, and, sql, arrayContains } from 'drizzle-orm'
import type { TagWithCount } from '../../types'

/**
 * Validation Schema for POST requests
 */
const CreateArticleSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters'),
  content: z.string()
    .default(''),
  tags: z.array(z.string().max(50))
    .default([])
    .transform(tags =>
      [...new Set(tags.map(tag => tag.toLowerCase().trim().replace(/^#/, '')))]
        .filter(tag => tag.length > 0)
    ),
  collection_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  is_favorite: z.boolean().default(false)
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
    const search = searchParams.get('search')
    const tag = searchParams.get('tag')
    const collectionId = searchParams.get('collection_id')
    const status = searchParams.get('status')
    const isFavorite = searchParams.get('is_favorite')
    const isDeleted = searchParams.get('is_deleted')
    const sortBy = searchParams.get('sort_by') || 'updated_at'
    const sortDir = searchParams.get('sort_dir') || 'desc'
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10) || 200, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    // Build SQL WHERE conditions
    const conditions = [
      isDeleted === 'true'
        ? eq(knowledgeArticles.isDeleted, true)
        : eq(knowledgeArticles.isDeleted, false)
    ]

    if (collectionId) {
      conditions.push(eq(knowledgeArticles.collectionId, collectionId))
    }
    if (status === 'draft' || status === 'published') {
      conditions.push(eq(knowledgeArticles.status, status))
    }
    if (isFavorite === 'true') {
      conditions.push(eq(knowledgeArticles.isFavorite, true))
    }
    if (tag) {
      const normalizedTag = tag.toLowerCase().trim().replace(/^#/, '')
      conditions.push(arrayContains(knowledgeArticles.tags, [normalizedTag]))
    }
    if (search) {
      conditions.push(
        or(
          ilike(knowledgeArticles.title, `%${search}%`),
          ilike(knowledgeArticles.content, `%${search}%`)
        )!
      )
    }

    // Determine sort column and direction
    const sortColumn = sortBy === 'title'
      ? knowledgeArticles.title
      : sortBy === 'created_at'
        ? knowledgeArticles.createdAt
        : knowledgeArticles.updatedAt
    const orderBy = sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn)

    // Fetch articles with collection join (RLS filters automatically)
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

    // Extract all unique tags with counts (from non-deleted articles, separate efficient query)
    const allArticleTags = await withRLS(async (db) =>
      db
        .select({ tags: knowledgeArticles.tags })
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.isDeleted, false))
    )

    const tagCounts = new Map<string, number>()
    for (const article of allArticleTags) {
      for (const t of article.tags || []) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
      }
    }

    const allTags: TagWithCount[] = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      articles: toSnakeCase(articles) || [],
      count: articles?.length || 0,
      allTags
    })

  } catch (error) {
    console.error('GET /api/modules/knowledge-manager/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
      .where(eq(knowledgeArticles.id, articleData[0].id))
      .limit(1)
    )

    return NextResponse.json(
      { article: toSnakeCase(article[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/knowledge-manager/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
