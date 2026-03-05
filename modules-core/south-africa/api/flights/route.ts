/**
 * South Africa Module - Flights API Route
 *
 * Endpoints:
 * - GET /api/modules/south-africa/flights - List all flights for the user
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { travelFlights } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'

/**
 * GET Handler - Fetch all flights for the authenticated user
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

    // RLS automatically filters by user_id
    const flights = await withRLS((db) =>
      db.select().from(travelFlights).orderBy(asc(travelFlights.sortOrder))
    )

    return NextResponse.json({
      flights: toSnakeCase(flights) || [],
      count: flights?.length || 0
    })

  } catch (error) {
    console.error('GET /api/modules/south-africa/flights error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
