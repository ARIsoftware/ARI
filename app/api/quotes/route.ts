import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'

// Validation schemas
const createQuoteSchema = z.object({
  quote: z.object({
    quote: z.string().min(1, 'Quote text is required').max(1000, 'Quote is too long'),
    author: z.string().max(200, 'Author name is too long').optional().nullable()
  })
})

const updateQuoteSchema = z.object({
  id: z.string().uuid('Invalid quote ID format'),
  updates: z.object({
    quote: z.string().min(1, 'Quote text is required').max(1000, 'Quote is too long').optional(),
    author: z.string().max(200, 'Author name is too long').optional().nullable()
  })
})

const deleteQuerySchema = z.object({
  id: z.string().uuid('Invalid quote ID format')
})

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Explicit user filtering for defense-in-depth (RLS also enforces this)
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching quotes:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, createQuoteSchema)
    if (!validation.success) {
      return validation.response
    }

    const { quote } = validation.data
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Insert quote with user_id
    const { data, error } = await supabase
      .from('quotes')
      .insert([{
        ...quote,
        user_id: user.id
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating quote:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, updateQuoteSchema)
    if (!validation.success) {
      return validation.response
    }

    const { id, updates } = validation.data
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Explicit user filtering - only update user's own quotes
    const { data, error } = await supabase
      .from('quotes')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating quote:', error)
      return createErrorResponse(error.message, 500)
    }

    if (!data) {
      return createErrorResponse('Quote not found or unauthorized', 404)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Validate query parameters
    const queryValidation = validateQueryParams(searchParams, deleteQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { id } = queryValidation.data
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return createErrorResponse('Authentication required', 401)
    }

    // Explicit user filtering - only delete user's own quotes
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting quote:', error)
      return createErrorResponse(error.message, 500)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
