/**
 * ARI Launch Module - Data API Routes (v2)
 *
 * Supports multiple tasks per day with drag-and-drop.
 *
 * Endpoints:
 * - GET    /api/modules/ari-launch/data       - List all entries for user
 * - POST   /api/modules/ari-launch/data       - Create new task
 * - PATCH  /api/modules/ari-launch/data       - Update task (move or edit)
 * - DELETE /api/modules/ari-launch/data?id=x  - Delete task
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { ariLaunchEntries } from '@/lib/db/schema'
import { eq, asc, and } from 'drizzle-orm'

/**
 * Validation Schema for POST requests (create)
 */
const CreateEntrySchema = z.object({
  day_number: z.number().int().min(1).max(45),
  title: z.string().min(1).max(500)
})

/**
 * Validation Schema for PATCH requests (update/move)
 */
const UpdateEntrySchema = z.object({
  id: z.string().uuid(),
  day_number: z.number().int().min(1).max(45).optional(),
  title: z.string().min(1).max(500).optional(),
  order_index: z.number().int().min(0).optional()
})

/**
 * GET Handler - Fetch all entries for the authenticated user
 *
 * Authentication: Required (Bearer token)
 * Returns: { entries: AriLaunchEntry[], count: number }
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
    const entries = await withRLS((db) =>
      db.select()
        .from(ariLaunchEntries)
        .orderBy(asc(ariLaunchEntries.dayNumber), asc(ariLaunchEntries.orderIndex))
    )

    return NextResponse.json({
      entries: toSnakeCase(entries) || [],
      count: entries?.length || 0
    })

  } catch (error) {
    console.error('GET /api/modules/ari-launch/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create a new task
 *
 * Authentication: Required (Bearer token)
 * Body: { day_number: number, title: string }
 * Returns: { entry: AriLaunchEntry }
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

    // Parse and validate request body
    const body = await request.json()
    const parseResult = CreateEntrySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { day_number, title } = parseResult.data

    // Find the maximum order_index for this day to place new task at the bottom
    const existingEntries = await withRLS((db) =>
      db.select({ orderIndex: ariLaunchEntries.orderIndex })
        .from(ariLaunchEntries)
        .where(eq(ariLaunchEntries.dayNumber, day_number))
    )

    const maxOrderIndex = existingEntries.length > 0
      ? Math.max(...existingEntries.map(e => e.orderIndex ?? 0))
      : -1

    // Insert new task at the bottom (max order_index + 1)
    const data = await withRLS((db) =>
      db.insert(ariLaunchEntries)
        .values({
          userId: user.id,
          dayNumber: day_number,
          title,
          orderIndex: maxOrderIndex + 1
        })
        .returning()
    )

    return NextResponse.json(
      { entry: toSnakeCase(data[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/ari-launch/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH Handler - Update a task (edit title or move to different day)
 *
 * Authentication: Required (Bearer token)
 * Body: { id: string, day_number?: number, title?: string, order_index?: number }
 * Returns: { entry: AriLaunchEntry }
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

    // Parse and validate request body
    const body = await request.json()
    const parseResult = UpdateEntrySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { id, day_number, title, order_index } = parseResult.data

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString()
    }

    if (day_number !== undefined) updateData.dayNumber = day_number
    if (title !== undefined) updateData.title = title
    if (order_index !== undefined) updateData.orderIndex = order_index

    // Update the task
    const data = await withRLS((db) =>
      db.update(ariLaunchEntries)
        .set(updateData)
        .where(eq(ariLaunchEntries.id, id))
        .returning()
    )

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ entry: toSnakeCase(data[0]) })

  } catch (error) {
    console.error('PATCH /api/modules/ari-launch/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete a task by ID
 *
 * Authentication: Required (Bearer token)
 * Query Params: id (UUID)
 * Returns: { success: boolean }
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

    // Get ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    // RLS automatically ensures user can only delete their own entries
    await withRLS((db) =>
      db.delete(ariLaunchEntries).where(eq(ariLaunchEntries.id, id))
    )

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('DELETE /api/modules/ari-launch/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
