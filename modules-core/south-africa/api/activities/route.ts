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
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { travelActivities } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'

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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const activities = await withRLS((db) =>
      db.select().from(travelActivities).where(eq(travelActivities.userId, user.id)).orderBy(asc(travelActivities.startDate))
    )

    return NextResponse.json({
      activities: toSnakeCase(activities) || [],
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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
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

    const data = await withRLS((db) =>
      db.insert(travelActivities)
        .values({
          userId: user.id,
          title,
          startDate: start_date,
          endDate: end_date,
          address,
          activityType: activity_type,
          lat,
          lng
        })
        .returning()
    )

    return NextResponse.json(
      { activity: toSnakeCase(data[0]) },
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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
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

    // RLS automatically ensures user can only update their own activities
    const data = await withRLS((db) =>
      db.update(travelActivities)
        .set({
          title,
          startDate: start_date,
          endDate: end_date,
          address,
          activityType: activity_type,
          lat,
          lng
        })
        .where(eq(travelActivities.id, id))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'Activity not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ activity: toSnakeCase(data[0]) })

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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
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

    // RLS automatically ensures user can only delete their own activities
    await withRLS((db) =>
      db.delete(travelActivities).where(eq(travelActivities.id, id))
    )

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
