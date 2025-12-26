import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { createShipmentSchema, updateShipmentSchema } from '@/modules-core/shipments/lib/validation'
import { shipments } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

/**
 * Shipments API - Consolidated Route
 *
 * GET /api/modules/shipments/items - Get all shipments
 * GET /api/modules/shipments/items?id=xxx - Get single shipment
 * POST /api/modules/shipments/items - Create shipment
 * PATCH /api/modules/shipments/items?id=xxx - Update shipment
 * DELETE /api/modules/shipments/items?id=xxx - Delete shipment
 */

// GET - Fetch all shipments OR single shipment by ID
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check if fetching single item
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      // Fetch single shipment (RLS filters automatically)
      const data = await withRLS((db) =>
        db.select()
          .from(shipments)
          .where(eq(shipments.id, id))
          .limit(1)
      )

      if (data.length === 0) {
        return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
      }

      return NextResponse.json(toSnakeCase(data[0]))
    } else {
      // Fetch all shipments (RLS filters automatically)
      const data = await withRLS((db) =>
        db.select().from(shipments).orderBy(desc(shipments.createdAt))
      )

      return NextResponse.json(toSnakeCase(data) || [])
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create a new shipment
export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createShipmentSchema)
    if (!validation.success) {
      return validation.response
    }

    const { shipment } = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const data = await withRLS((db) =>
      db.insert(shipments)
        .values({
          ...shipment,
          userId: user.id
        })
        .returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// PATCH - Update a shipment
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return createErrorResponse('Shipment ID is required', 400)
    }

    // Validate request body
    const validation = await validateRequestBody(request, updateShipmentSchema)
    if (!validation.success) {
      return validation.response
    }

    const updates = validation.data
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically ensures user can only update their own shipments
    const data = await withRLS((db) =>
      db.update(shipments)
        .set(updates)
        .where(eq(shipments.id, id))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Shipment not found', 404)
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

// DELETE - Delete a shipment
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Shipment ID is required' }, { status: 400 })
    }

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically ensures user can only delete their own shipments
    await withRLS((db) =>
      db.delete(shipments).where(eq(shipments.id, id))
    )

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
