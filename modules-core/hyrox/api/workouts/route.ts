import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { completeHyroxWorkoutSchema, paginationSchema } from '@/lib/validation'
import { hyroxWorkouts } from '@/lib/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse("Authentication required", 401)
    }

    const { searchParams } = new URL(req.url)

    // Validate query parameters
    const queryValidation = validateQueryParams(searchParams, paginationSchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { limit } = queryValidation.data

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select()
        .from(hyroxWorkouts)
        .where(eq(hyroxWorkouts.completed, true))
        .orderBy(desc(hyroxWorkouts.completedAt))
        .limit(limit)
    )

    return NextResponse.json(toSnakeCase(data) || [])
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch workout history' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse("Authentication required", 401)
    }

    // INSERT requires explicit user_id
    const data = await withRLS((db) =>
      db.insert(hyroxWorkouts)
        .values({
          userId: user.id,
          totalTime: 0,
          completed: false,
        })
        .returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to create workout' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse("Authentication required", 401)
    }

    // Validate request body
    const validation = await validateRequestBody(req, completeHyroxWorkoutSchema)
    if (!validation.success) {
      return validation.response
    }

    const { workoutId, totalTime } = validation.data

    // RLS automatically ensures user can only update their own workouts
    const data = await withRLS((db) =>
      db.update(hyroxWorkouts)
        .set({
          totalTime: totalTime,
          completed: true,
          completedAt: sql`timezone('utc'::text, now())`,
        })
        .where(eq(hyroxWorkouts.id, workoutId))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Workout not found or access denied', 404)
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to complete workout' },
      { status: 500 }
    )
  }
}
