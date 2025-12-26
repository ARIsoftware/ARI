/**
 * Ohtani Module - Data API Routes
 *
 * This file defines API endpoints for managing ohtani grid cells.
 *
 * Endpoints:
 * - GET /api/modules/ohtani/data - Get all grid cells for user
 * - PUT /api/modules/ohtani/data - Update a specific cell
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { ohtaniGridCells } from '@/lib/db/schema'
import { eq, asc, and, sql } from 'drizzle-orm'

/**
 * Validation Schema for PUT requests
 * Uses Zod for runtime type validation
 */
const UpdateCellSchema = z.object({
  row_index: z.number()
    .int()
    .min(0, 'Row index must be between 0 and 8')
    .max(8, 'Row index must be between 0 and 8'),
  col_index: z.number()
    .int()
    .min(0, 'Column index must be between 0 and 8')
    .max(8, 'Column index must be between 0 and 8'),
  content: z.string()
    .max(15, 'Content must be 15 characters or less')
})

/**
 * GET Handler - Fetch all grid cells for the authenticated user
 *
 * Authentication: Required (Bearer token)
 * Returns: { cells: OhtaniGridCell[] }
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
    const cells = await withRLS((db) =>
      db.select()
        .from(ohtaniGridCells)
        .orderBy(asc(ohtaniGridCells.rowIndex), asc(ohtaniGridCells.colIndex))
    )

    return NextResponse.json({
      cells: toSnakeCase(cells) || []
    })

  } catch (error) {
    console.error('GET /api/modules/ohtani/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT Handler - Update or create a grid cell
 *
 * Authentication: Required (Bearer token)
 * Body: { row_index: number, col_index: number, content: string }
 * Returns: { cell: OhtaniGridCell }
 */
export async function PUT(request: NextRequest) {
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
    const parseResult = UpdateCellSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const { row_index, col_index, content } = parseResult.data

    // Check if cell exists (RLS filters automatically)
    const existing = await withRLS((db) =>
      db.select({ id: ohtaniGridCells.id })
        .from(ohtaniGridCells)
        .where(and(
          eq(ohtaniGridCells.rowIndex, row_index),
          eq(ohtaniGridCells.colIndex, col_index)
        ))
        .limit(1)
    )

    let cell
    if (existing.length > 0) {
      // Update existing cell
      const updated = await withRLS((db) =>
        db.update(ohtaniGridCells)
          .set({
            content,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(eq(ohtaniGridCells.id, existing[0].id))
          .returning()
      )
      cell = updated[0]
    } else {
      // Insert new cell
      const inserted = await withRLS((db) =>
        db.insert(ohtaniGridCells)
          .values({
            userId: user.id,
            rowIndex: row_index,
            colIndex: col_index,
            content
          })
          .returning()
      )
      cell = inserted[0]
    }

    return NextResponse.json({ cell: toSnakeCase(cell) })

  } catch (error) {
    console.error('PUT /api/modules/ohtani/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
