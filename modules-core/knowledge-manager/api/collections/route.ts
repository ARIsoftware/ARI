/**
 * Knowledge Manager Module - Collections API Routes
 *
 * Endpoints:
 * - GET    /api/modules/knowledge-manager/collections       - List all collections
 * - POST   /api/modules/knowledge-manager/collections       - Create new collection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, createErrorResponse } from '@/lib/api-helpers'
import { safeErrorResponse } from '@/lib/api-error'
import {
  createCollectionSchema as CreateCollectionSchema,
  CollectionListResponseSchema,
  CollectionSingleResponseSchema,
} from '@/modules/knowledge-manager/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { knowledgeCollections, knowledgeArticles } from '@/lib/db/schema'
import { eq, and, asc, desc, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/knowledge-manager/collections',
  operationId: 'listKnowledgeCollections',
  summary: 'List collections with article counts',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Collections (sorted by sort_order then name)', content: { 'application/json': { schema: CollectionListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/knowledge-manager/collections',
  operationId: 'createKnowledgeCollection',
  summary: 'Create a new collection',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateCollectionSchema } } } },
  responses: {
    201: { description: 'Created collection (article_count = 0)', content: { 'application/json': { schema: CollectionSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * GET Handler - Fetch all collections with article counts
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

    // Explicit user_id filter is mandatory (BYPASSRLS — see docs/SECURITY.md)
    const collections = await withRLS((db) =>
      db.select()
        .from(knowledgeCollections)
        .where(eq(knowledgeCollections.userId, user.id))
        .orderBy(asc(knowledgeCollections.sortOrder), asc(knowledgeCollections.name))
    )

    // Article counts per collection, aggregated in the DB (GROUP BY) rather than
    // by pulling every article row into the app.
    const counts = await withRLS((db) =>
      db.select({
        collectionId: knowledgeArticles.collectionId,
        count: sql<number>`count(*)::int`,
      })
        .from(knowledgeArticles)
        .where(and(
          eq(knowledgeArticles.userId, user.id),
          eq(knowledgeArticles.isDeleted, false)
        ))
        .groupBy(knowledgeArticles.collectionId)
    )

    const countMap = new Map<string, number>()
    for (const row of counts) {
      if (row.collectionId) {
        countMap.set(row.collectionId, row.count)
      }
    }

    // Add counts to collections
    const collectionsWithCounts = (collections || []).map(collection => ({
      ...collection,
      article_count: countMap.get(collection.id) || 0
    }))

    return NextResponse.json({
      collections: toSnakeCase(collectionsWithCounts)
    })

  } catch (error) {
    console.error('GET /api/modules/knowledge-manager/collections error:', safeErrorResponse(error))
    return createErrorResponse('Internal server error', 500)
  }
}

/**
 * POST Handler - Create a new collection
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
    const parseResult = CreateCollectionSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { name, color, icon } = parseResult.data

    // Get max sort_order (explicit user_id filter — BYPASSRLS)
    const existing = await withRLS((db) =>
      db.select({ sortOrder: knowledgeCollections.sortOrder })
        .from(knowledgeCollections)
        .where(eq(knowledgeCollections.userId, user.id))
        .orderBy(desc(knowledgeCollections.sortOrder))
        .limit(1)
    )

    const nextSortOrder = (existing?.[0]?.sortOrder ?? -1) + 1

    // INSERT requires explicit user_id
    const collection = await withRLS((db) =>
      db.insert(knowledgeCollections)
        .values({
          userId: user.id,
          name,
          color,
          icon,
          sortOrder: nextSortOrder
        })
        .returning()
    )

    return NextResponse.json(
      { collection: toSnakeCase({ ...collection[0], article_count: 0 }) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/knowledge-manager/collections error:', safeErrorResponse(error))
    return createErrorResponse('Internal server error', 500)
  }
}
