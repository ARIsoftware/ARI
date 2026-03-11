/**
 * Hello World Module - Data API Routes
 *
 * This file defines API endpoints for managing hello world entries.
 * It demonstrates:
 * - Authentication validation
 * - Zod schema validation
 * - Database operations with Drizzle ORM + withRLS
 * - Error handling
 * - HTTP method handlers (GET, POST, DELETE)
 *
 * IMPORTANT: Module API routes follow Next.js App Router conventions
 * and are accessed via /api/modules/[module-id]/[...path]
 *
 * Endpoints:
 * - GET    /api/modules/hello-world/data       - List all entries
 * - POST   /api/modules/hello-world/data       - Create new entry
 * - DELETE /api/modules/hello-world/data?id=x  - Delete entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { helloWorldEntries } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

/**
 * Validation Schema for POST requests
 * Uses Zod for runtime type validation
 */
const CreateEntrySchema = z.object({
  message: z.string()
    .min(1, 'Message is required')
    .max(500, 'Message must be less than 500 characters')
})

/**
 * GET Handler - Fetch all entries for the authenticated user
 *
 * Authentication: Required (Bearer token)
 * Query Params: None
 * Returns: { entries: HelloWorldEntry[] }
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
        .from(helloWorldEntries)
        .orderBy(desc(helloWorldEntries.createdAt))
    )

    return NextResponse.json({
      entries: toSnakeCase(entries) || [],
      count: entries?.length || 0
    })

  } catch (error) {
    console.error('GET /api/modules/hello-world/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST Handler - Create a new entry
 *
 * Authentication: Required (Bearer token)
 * Body: { message: string }
 * Returns: { entry: HelloWorldEntry }
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

    const { message } = parseResult.data

    // INSERT requires explicit user_id
    const data = await withRLS((db) =>
      db.insert(helloWorldEntries)
        .values({
          userId: user.id,
          message
        })
        .returning()
    )

    return NextResponse.json(
      { entry: toSnakeCase(data[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/hello-world/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete an entry by ID
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
      db.delete(helloWorldEntries).where(eq(helloWorldEntries.id, id))
    )

    return NextResponse.json({
      success: true,
      message: 'Entry deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/modules/hello-world/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
