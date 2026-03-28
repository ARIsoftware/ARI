import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { winterArcGoals } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const data = await withRLS((db) =>
      db.select()
        .from(winterArcGoals)
        .where(eq(winterArcGoals.userId, user.id))
        .orderBy(asc(winterArcGoals.createdAt))
    )

    return NextResponse.json(toSnakeCase(data))
  } catch (error: any) {
    console.error('Error in GET /api/winter-arc-goals:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { title } = body

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // INSERT requires explicit user_id
    const data = await withRLS((db) =>
      db.insert(winterArcGoals)
        .values({
          userId: user.id,
          title: title.trim(),
        })
        .returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/winter-arc-goals:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
