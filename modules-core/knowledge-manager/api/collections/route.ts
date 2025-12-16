/**
 * Knowledge Manager Module - Collections API Routes
 *
 * Endpoints:
 * - GET    /api/modules/knowledge-manager/collections       - List all collections
 * - POST   /api/modules/knowledge-manager/collections       - Create new collection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Get collections with article counts
    const { data: collections, error: dbError } = await supabase
      .from('knowledge_collections')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch collections' },
        { status: 500 }
      )
    }

    // Get article counts for each collection
    const { data: articles, error: articlesError } = await supabase
      .from('knowledge_articles')
      .select('collection_id')
      .eq('user_id', user.id)
      .eq('is_deleted', false)

    if (articlesError) {
      console.error('Database error:', articlesError)
    }

    // Calculate counts
    const countMap = new Map<string, number>()
    for (const article of articles || []) {
      if (article.collection_id) {
        countMap.set(article.collection_id, (countMap.get(article.collection_id) || 0) + 1)
      }
    }

    // Add counts to collections
    const collectionsWithCounts = (collections || []).map(collection => ({
      ...collection,
      article_count: countMap.get(collection.id) || 0
    }))

    return NextResponse.json({
      collections: collectionsWithCounts
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    // Get max sort_order
    const { data: existing } = await supabase
      .from('knowledge_collections')
      .select('sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1

    const { data: collection, error: dbError } = await supabase
      .from('knowledge_collections')
      .insert({
        user_id: user.id,
        name,
        color,
        icon,
        sort_order: nextSortOrder
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to create collection' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { collection: { ...collection, article_count: 0 } },
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
