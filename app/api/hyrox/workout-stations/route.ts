import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { addWorkoutStationSchema } from '@/lib/validation'

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse("Authentication required", 401)
    }

    // Validate request body
    const validation = await validateRequestBody(req, addWorkoutStationSchema)
    if (!validation.success) {
      return validation.response
    }

    const { workoutId, stationName, stationOrder, stationTime, completed } = validation.data

    // Verify the workout belongs to this user using RLS-enabled client
    const { data: workout, error: workoutError } = await supabase
      .from('hyrox_workouts')
      .select('user_id, id')
      .eq('id', workoutId)
      .eq('user_id', user.id)  // CRITICAL: Explicit user verification
      .single()

    if (workoutError || !workout) {
      return createErrorResponse("Workout not found or access denied", 404)
    }

    // Use user-scoped client with RLS
    const { data, error } = await supabase
      .from('hyrox_workout_stations')
      .insert({
        workout_id: workoutId,
        station_name: stationName,
        station_order: stationOrder,
        station_time: stationTime,
        completed: completed,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding workout station:', error)
      return createErrorResponse('Failed to add workout station', 500)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('API Error:', error)
    return createErrorResponse('Failed to add workout station', 500)
  }
}