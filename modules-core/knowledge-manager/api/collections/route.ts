/**
 * Knowledge Manager Module - Collections API Routes
 *
 * Endpoints:
 * - GET    /api/modules/knowledge-manager/collections       - List all collections
 * - POST   /api/modules/knowledge-manager/collections       - Create new collection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { knowledgeCollections, knowledgeArticles } from '@/lib/db/schema'
import { eq, asc, desc } from 'drizzle-orm'

/**
 * Validation Schema for POST requests
 */
const CreateCollectionSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
    .default('#6b7280'),
  icon: z.string()
    .max(50)
    .default('Folder')
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

    // Get collections (RLS filters automatically)
    const collections = await withRLS((db) =>
      db.select()
        .from(knowledgeCollections)
        .orderBy(asc(knowledgeCollections.sortOrder), asc(knowledgeCollections.name))
    )

    // Get article counts for each collection (RLS filters automatically)
    const articles = await withRLS((db) =>
      db.select({ collectionId: knowledgeArticles.collectionId })
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.isDeleted, false))
    )

    // Calculate counts
    const countMap = new Map<string, number>()
    for (const article of articles || []) {
      if (article.collectionId) {
        countMap.set(article.collectionId, (countMap.get(article.collectionId) || 0) + 1)
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
    console.error('GET /api/modules/knowledge-manager/collections error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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

    // Get max sort_order (RLS filters automatically)
    const existing = await withRLS((db) =>
      db.select({ sortOrder: knowledgeCollections.sortOrder })
        .from(knowledgeCollections)
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
    console.error('POST /api/modules/knowledge-manager/collections error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
