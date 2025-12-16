/**
 * Knowledge Manager Module - Data API Routes
 *
 * Endpoints:
 * - GET    /api/modules/knowledge-manager/data       - List articles with filters
 * - POST   /api/modules/knowledge-manager/data       - Create new article
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
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
 *
 * Query Parameters:
 * - search: Search in title and content
 * - tag: Filter by tag
 * - collection_id: Filter by collection
 * - status: Filter by status (draft/published)
 * - is_favorite: Filter favorites only
 * - is_deleted: Filter deleted/trash items
 * - sort_by: Sort field (updated_at, created_at, title)
 * - sort_dir: Sort direction (asc, desc)
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

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const tag = searchParams.get('tag')
    const collectionId = searchParams.get('collection_id')
    const status = searchParams.get('status')
    const isFavorite = searchParams.get('is_favorite')
    const isDeleted = searchParams.get('is_deleted')
    const sortBy = searchParams.get('sort_by') || 'updated_at'
    const sortDir = searchParams.get('sort_dir') || 'desc'

    // Build query with collection join
    let query = supabase
      .from('knowledge_articles')
      .select(`
        *,
        collection:knowledge_collections(id, name, color, icon)
      `)
      .eq('user_id', user.id)

    // Filter by deleted status (default: show non-deleted)
    if (isDeleted === 'true') {
      query = query.eq('is_deleted', true)
    } else {
      query = query.eq('is_deleted', false)
    }

    // Filter by collection
    if (collectionId) {
      query = query.eq('collection_id', collectionId)
    }

    // Filter by status
    if (status === 'draft' || status === 'published') {
      query = query.eq('status', status)
    }

    // Filter favorites
    if (isFavorite === 'true') {
      query = query.eq('is_favorite', true)
    }

    // Filter by tag
    if (tag) {
      query = query.contains('tags', [tag.toLowerCase().trim().replace(/^#/, '')])
    }

    // Search in title and content
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    // Apply sorting
    const ascending = sortDir === 'asc'
    if (sortBy === 'title') {
      query = query.order('title', { ascending })
    } else if (sortBy === 'created_at') {
      query = query.order('created_at', { ascending })
    } else {
      query = query.order('updated_at', { ascending })
    }

    const { data: articles, error: dbError } = await query

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch articles' },
        { status: 500 }
      )
    }

    // Extract all unique tags with counts (from non-deleted articles)
    const tagCounts = new Map<string, number>()
    const allArticles = articles || []

    for (const article of allArticles) {
      if (!article.is_deleted) {
        for (const tag of article.tags || []) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        }
      }
    }

    const allTags: TagWithCount[] = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      articles: articles || [],
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    const { data: article, error: dbError } = await supabase
      .from('knowledge_articles')
      .insert({
        user_id: user.id,
        title,
        content,
        tags,
        collection_id: collection_id || null,
        status,
        is_favorite,
        is_deleted: false
      })
      .select(`
        *,
        collection:knowledge_collections(id, name, color, icon)
      `)
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to create article' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { article },
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
