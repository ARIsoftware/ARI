import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { contributionGraph } from '@/lib/db/schema'
import { eq, asc, and, sql } from 'drizzle-orm'

const updateColorSchema = z.object({
  goal_id: z.string().uuid(),
  box_index: z.number().int().min(0).max(17),
  color: z.enum(['light-grey', 'dark-grey', 'black', 'green', 'red'])
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const data = await withRLS((db) =>
      db.select().from(contributionGraph).where(eq(contributionGraph.userId, user.id)).orderBy(asc(contributionGraph.boxIndex))
    )

    return NextResponse.json(toSnakeCase(data) || [])
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, updateColorSchema)
    if (!validation.success) {
      return validation.response
    }

    const { goal_id, box_index, color } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Check if entry exists for this user
    const existing = await withRLS((db) =>
      db.select({ id: contributionGraph.id })
        .from(contributionGraph)
        .where(and(
          eq(contributionGraph.userId, user.id),
          eq(contributionGraph.goalId, goal_id),
          eq(contributionGraph.boxIndex, box_index)
        ))
        .limit(1)
    )

    let data
    if (existing.length > 0) {
      // Update existing entry
      const updated = await withRLS((db) =>
        db.update(contributionGraph)
          .set({
            color,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(and(eq(contributionGraph.id, existing[0].id), eq(contributionGraph.userId, user.id)))
          .returning()
      )
      data = updated[0]
    } else {
      // Insert new entry
      const inserted = await withRLS((db) =>
        db.insert(contributionGraph)
          .values({
            userId: user.id,
            goalId: goal_id,
            boxIndex: box_index,
            color
          })
          .returning()
      )
      data = inserted[0]
    }

    return NextResponse.json(toSnakeCase(data), { status: 200 })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
