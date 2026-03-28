import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { motivationContent } from '@/lib/db/schema'
import { eq, asc, desc, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const data = await withRLS((db) =>
      db.select()
        .from(motivationContent)
        .where(eq(motivationContent.userId, user.id))
        .orderBy(asc(motivationContent.position), desc(motivationContent.createdAt))
    )

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { type, title, url, thumbnail_url, image_url } = body

    if (!type) {
      return createErrorResponse('Type is required', 400)
    }

    // Get max position for ordering
    const maxPosResult = await withRLS((db) =>
      db.select({ position: motivationContent.position })
        .from(motivationContent)
        .where(eq(motivationContent.userId, user.id))
        .orderBy(desc(motivationContent.position))
        .limit(1)
    )

    const nextPosition = maxPosResult.length > 0 ? (maxPosResult[0].position || 0) + 1 : 0

    const data = await withRLS((db) =>
      db.insert(motivationContent)
        .values({
          userId: user.id,
          type,
          title: title || null,
          url: url || null,
          thumbnailUrl: thumbnail_url || null,
          imageUrl: image_url || null,
          position: nextPosition,
        })
        .returning()
    )

    return NextResponse.json(data[0])
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return createErrorResponse('ID is required', 400)
    }

    await withRLS((db) =>
      db.delete(motivationContent)
        .where(and(eq(motivationContent.id, id), eq(motivationContent.userId, user.id)))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
