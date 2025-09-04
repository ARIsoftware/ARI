import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { updateShipmentSchema } from '@/lib/validation'

// GET /api/shipments/[id] - Fetch a single shipment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
      }
      console.error('Error fetching shipment:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/shipments/[id] - Update a shipment
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
      .eq('id', params.id)
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

// DELETE /api/shipments/[id] - Delete a shipment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', params.id)

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