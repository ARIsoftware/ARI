import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { createGoalSchema } from '@/lib/validation'
import { northstar } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select().from(northstar).orderBy(desc(northstar.createdAt))
    )

    return NextResponse.json(toSnakeCase(data))
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createGoalSchema)
    if (!validation.success) {
      return validation.response
    }

    const { goal } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Handle empty deadline string - convert to null for DATE field
    const deadlineValue = goal.deadline && goal.deadline !== '' ? goal.deadline : null

    // INSERT requires explicit user_id - RLS validates it
    const data = await withRLS((db) =>
      db.insert(northstar).values({
        title: goal.title,
        description: goal.description || '',
        category: goal.category,
        priority: goal.priority,
        deadline: deadlineValue,
        progress: 0,
        userId: user.id,
        displayPriority: goal.display_priority,
      }).returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
