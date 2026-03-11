import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { addWorkoutStationSchema } from '@/lib/validation'
import { hyroxWorkouts, hyroxWorkoutStations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse("Authentication required", 401)
    }

    // Validate request body
    const validation = await validateRequestBody(req, addWorkoutStationSchema)
    if (!validation.success) {
      return validation.response
    }

    const { workoutId, stationName, stationOrder, stationTime, completed } = validation.data

    // Verify the workout belongs to this user (RLS filters automatically)
    const workout = await withRLS((db) =>
      db.select({ userId: hyroxWorkouts.userId, id: hyroxWorkouts.id })
        .from(hyroxWorkouts)
        .where(eq(hyroxWorkouts.id, workoutId))
        .limit(1)
    )

    if (workout.length === 0) {
      return createErrorResponse("Workout not found or access denied", 404)
    }

    // INSERT workout station (user_id required for RLS)
    const data = await withRLS((db) =>
      db.insert(hyroxWorkoutStations)
        .values({
          userId: user.id,
          workoutId: workoutId,
          stationName: stationName,
          stationOrder: stationOrder,
          stationTime: stationTime,
          completed: completed,
        })
        .returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (error) {
    console.error('API Error:', error)
    return createErrorResponse('Failed to add workout station', 500)
  }
}
