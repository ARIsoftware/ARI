/**
 * South Africa Module - Activities API Routes
 *
 * Endpoints:
 * - GET    /api/modules/south-africa/activities       - List all activities
 * - POST   /api/modules/south-africa/activities       - Create new activity
 * - PATCH  /api/modules/south-africa/activities?id=x  - Update activity
 * - DELETE /api/modules/south-africa/activities?id=x  - Delete activity
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

/**
 * Validation Schema for POST requests
 */
const CreateActivitySchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title must be less than 500 characters'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  address: z.string().min(1, 'Address is required'),
  activity_type: z.enum(['stay', 'event']),
  lat: z.number().optional(),
  lng: z.number().optional()
})

/**
 * GET Handler - Fetch all activities for the authenticated user
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

    const { data: activities, error: dbError } = await supabase
      .from('travel_activities')
      .select('*')
      .order('start_date', { ascending: true })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch activities' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      activities: activities || [],
      count: activities?.length || 0
    })

  } catch (error) {
    console.error('GET /api/modules/south-africa/activities error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create a new activity
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
    const parseResult = CreateActivitySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { title, start_date, end_date, address, activity_type, lat, lng } = parseResult.data

    const { data: activity, error: dbError } = await supabase
      .from('travel_activities')
      .insert({
        user_id: user.id,
        title,
        start_date,
        end_date,
        address,
        activity_type,
        lat,
        lng
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to create activity' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { activity },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/south-africa/activities error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH Handler - Update an activity
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parseResult = CreateActivitySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { title, start_date, end_date, address, activity_type, lat, lng } = parseResult.data

    const { data: activity, error: dbError } = await supabase
      .from('travel_activities')
      .update({
        title,
        start_date,
        end_date,
        address,
        activity_type,
        lat,
        lng
      })
      .eq('id', id)
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to update activity' },
        { status: 500 }
      )
    }

    return NextResponse.json({ activity })

  } catch (error) {
    console.error('PATCH /api/modules/south-africa/activities error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete an activity by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    const { error: dbError } = await supabase
      .from('travel_activities')
      .delete()
      .eq('id', id)

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to delete activity' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Activity deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/modules/south-africa/activities error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
