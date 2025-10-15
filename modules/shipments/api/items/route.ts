import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { createShipmentSchema, updateShipmentSchema } from '@/modules/shipments/lib/validation'

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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check if fetching single item
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      // Fetch single shipment
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
        }
        console.error('Error fetching shipment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json(data)
    } else {
      // Fetch all shipments
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching shipments:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json(data || [])
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    const { data, error } = await supabase
      .from('shipments')
      .insert([{ ...shipment, user_id: user.id }])
      .select()
      .single()

    if (error) {
      console.error('Error creating shipment:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data, { status: 201 })
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
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    const { data, error } = await supabase
      .from('shipments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Shipment not found', 404)
      }
      console.error('Error updating shipment:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data)
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

    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
      }
      console.error('Error deleting shipment:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
