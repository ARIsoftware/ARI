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
import { z } from 'zod'

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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Query database
    // Note: RLS policies automatically filter by user_id
    const { data: cells, error: dbError } = await supabase
      .from('ohtani_grid_cells')
      .select('*')
      .order('row_index', { ascending: true })
      .order('col_index', { ascending: true })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch grid cells' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      cells: cells || []
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
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

    // Upsert cell (update if exists, insert if not)
    const { data: cell, error: dbError } = await supabase
      .from('ohtani_grid_cells')
      .upsert({
        user_id: user.id,
        row_index,
        col_index,
        content
      }, {
        onConflict: 'user_id,row_index,col_index'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to update cell' },
        { status: 500 }
      )
    }

    return NextResponse.json({ cell })

  } catch (error) {
    console.error('PUT /api/modules/ohtani/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
