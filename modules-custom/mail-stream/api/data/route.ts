/**
 * Mail Stream Module - Data API Route
 *
 * Fetches webhook events for display in the UI.
 * Requires authentication (any authenticated user can view).
 *
 * Endpoints:
 * - GET /api/modules/mail-stream/data - List all events
 * - DELETE /api/modules/mail-stream/data?id=x - Delete an event
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { withAdminDb } from '@/lib/db'
import { mailStreamEvents } from '@/lib/db/schema'
import { desc, eq, sql, ilike, or, and } from 'drizzle-orm'

/**
 * GET Handler - Fetch all events
 *
 * Query params:
 * - category: 'all' | 'email' | 'contact' | 'domain'
 * - status: 'all' | email status
 * - search: search term (searches to, subject, from)
 * - limit: number of events to return (default 100)
 * - offset: pagination offset
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || 'all'
    const status = searchParams.get('status') || 'all'
    const search = searchParams.get('search') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Execute query with withAdminDb (global log, not user-specific)
    const result = await withAdminDb(async (db) => {
      // Build where conditions
      const conditions = []

      // Category filter
      if (category !== 'all') {
        conditions.push(eq(mailStreamEvents.eventCategory, category))
      }

      // Status filter (only for email events)
      if (status !== 'all') {
        conditions.push(eq(mailStreamEvents.status, status))
      }

      // Search filter
      if (search) {
        conditions.push(
          or(
            ilike(mailStreamEvents.subject, `%${search}%`),
            ilike(mailStreamEvents.fromAddress, `%${search}%`),
            sql`${mailStreamEvents.toAddresses}::text ILIKE ${'%' + search + '%'}`
          )
        )
      }

      // Build where clause
      const whereClause = conditions.length > 0
        ? and(...conditions)
        : undefined

      // Execute main query
      const events = await db
        .select()
        .from(mailStreamEvents)
        .where(whereClause)
        .orderBy(desc(mailStreamEvents.createdAt))
        .limit(limit)
        .offset(offset)

      // Get total count for pagination
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(mailStreamEvents)
        .where(whereClause)

      const totalCount = countResult[0]?.count || 0

      return { events, totalCount }
    })

    return NextResponse.json({
      events: toSnakeCase(result.events) || [],
      count: result.events?.length || 0,
      total: result.totalCount,
      limit,
      offset
    })

  } catch (error: any) {
    console.error('GET /api/modules/mail-stream/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete an event by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Get ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    // Delete the event
    await withAdminDb(async (db) => {
      await db.delete(mailStreamEvents).where(eq(mailStreamEvents.id, id))
    })

    return NextResponse.json({
      success: true,
      message: 'Event deleted successfully'
    })

  } catch (error: any) {
    console.error('DELETE /api/modules/mail-stream/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
