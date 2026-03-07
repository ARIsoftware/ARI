/**
 * Documents Module - Tags API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/tags - List all tags
 * - POST /api/modules/documents/tags - Create new tag
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { documentTags, documentTagAssignments } from '@/lib/db/schema'
import { count, eq } from 'drizzle-orm'

const CreateTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
})

/**
 * GET Handler - List all tags
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch all tags
    const tags = await withRLS((db: any) =>
      db.select()
        .from(documentTags)
        .orderBy(documentTags.name)
    )

    // Get usage count per tag
    const usageCounts = await withRLS((db: any) =>
      db.select({
        tagId: documentTagAssignments.tagId,
        count: count(documentTagAssignments.id),
      })
        .from(documentTagAssignments)
        .groupBy(documentTagAssignments.tagId)
    )

    const usageMap = new Map<string, number>()
    usageCounts.forEach((row: any) => {
      usageMap.set(row.tagId, Number(row.count))
    })

    const tagsWithCounts = tags.map((tag: any) => ({
      ...tag,
      usage_count: usageMap.get(tag.id) || 0,
    }))

    return NextResponse.json({
      tags: toSnakeCase(tagsWithCounts),
      count: tags.length,
    })

  } catch (error) {
    console.error('GET /api/modules/documents/tags error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create new tag
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parseResult = CreateTagSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { name, color } = parseResult.data

    // Check if tag with same name already exists
    const existing = await withRLS((db: any) =>
      db.select()
        .from(documentTags)
        .where(eq(documentTags.name, name))
        .limit(1)
    )

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'A tag with this name already exists' },
        { status: 409 }
      )
    }

    // Create tag
    const newTag = await withRLS((db: any) =>
      db.insert(documentTags)
        .values({
          userId: user.id,
          name,
          color,
        })
        .returning()
    )

    return NextResponse.json(
      { tag: toSnakeCase(newTag[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/documents/tags error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
