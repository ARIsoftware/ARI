import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { quotes } from '@/lib/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // RLS automatically filters by user_id
    const data = await withRLS((db) =>
      db.select()
        .from(quotes)
        .orderBy(desc(quotes.createdAt))
    )

    return NextResponse.json(toSnakeCase(data))
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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // INSERT requires explicit user_id
    const data = await withRLS((db) =>
      db.insert(quotes)
        .values({
          ...quote,
          userId: user.id
        })
        .returning()
    )

    return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically ensures user can only update their own quotes
    const data = await withRLS((db) =>
      db.update(quotes)
        .set({
          ...updates,
          updatedAt: sql`timezone('utc'::text, now())`
        })
        .where(eq(quotes.id, id))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Quote not found or unauthorized', 404)
    }

    return NextResponse.json(toSnakeCase(data[0]))
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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // RLS automatically ensures user can only delete their own quotes
    await withRLS((db) =>
      db.delete(quotes).where(eq(quotes.id, id))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err)
    return createErrorResponse('Internal server error', 500)
  }
}
