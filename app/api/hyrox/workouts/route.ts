import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { completeHyroxWorkoutSchema, paginationSchema } from '@/lib/validation'

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse("Authentication required", 401)
    }

    const { searchParams } = new URL(req.url)
    
    // Validate query parameters
    const queryValidation = validateQueryParams(searchParams, paginationSchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { limit } = queryValidation.data

    // Use user-scoped client with RLS - explicitly filter by user_id for security
    const { data, error } = await supabase
      .from('hyrox_workouts')
      .select('*')
      .eq('user_id', user.id)  // CRITICAL: Explicit user filtering
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching workout history:', error)
      return createErrorResponse('Failed to fetch workout history', 500)
    }

    return NextResponse.json(data || [])
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
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse("Authentication required", 401)
    }

    // Use user-scoped client with RLS - user_id will be automatically set by RLS
    const { data, error } = await supabase
      .from('hyrox_workouts')
      .insert({
        user_id: user.id,  // CRITICAL: Explicit user association
        total_time: 0,
        completed: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating workout:', error)
      return createErrorResponse('Failed to create workout', 500)
    }

    return NextResponse.json(data, { status: 201 })
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
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return createErrorResponse("Authentication required", 401)
    }

    // Validate request body
    const validation = await validateRequestBody(req, completeHyroxWorkoutSchema)
    if (!validation.success) {
      return validation.response
    }

    const { workoutId, totalTime } = validation.data

    // Use user-scoped client with RLS - explicitly filter by user_id for security
    const { data, error } = await supabase
      .from('hyrox_workouts')
      .update({
        total_time: totalTime,
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', workoutId)
      .eq('user_id', user.id)  // CRITICAL: Only update user's own workouts
      .select()
      .single()

    if (error) {
      console.error('Error completing workout:', error)
      return createErrorResponse('Failed to complete workout', 500)
    }

    if (!data) {
      return createErrorResponse('Workout not found or access denied', 404)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to complete workout' },
      { status: 500 }
    )
  }
}