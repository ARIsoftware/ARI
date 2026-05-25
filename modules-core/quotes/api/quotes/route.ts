import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validateQueryParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  createQuoteSchema,
  updateQuoteSchema,
  deleteQuoteQuerySchema as deleteQuerySchema,
  listQuotesQuerySchema as listQuerySchema,
  QuoteSchema,
  QuoteListSchema,
  DeleteSuccessSchema,
} from '@/modules/quotes/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { quotes } from '@/lib/db/schema'
import { eq, desc, sql, and } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/quotes/quotes',
  operationId: 'listQuotes',
  summary: 'List quotes',
  tags: ['quotes'],
  security: DEFAULT_SECURITY,
  request: { query: listQuerySchema },
  responses: {
    200: { description: "All of the user's quotes (created_at desc)", content: { 'application/json': { schema: QuoteListSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/quotes/quotes',
  operationId: 'createQuote',
  summary: 'Create a quote',
  tags: ['quotes'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: createQuoteSchema } } } },
  responses: {
    201: { description: 'Created quote', content: { 'application/json': { schema: QuoteSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/quotes/quotes',
  operationId: 'updateQuote',
  summary: 'Update a quote by id (id in body)',
  tags: ['quotes'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: updateQuoteSchema } } } },
  responses: {
    200: { description: 'Updated quote', content: { 'application/json': { schema: QuoteSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'Quote not found or unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/quotes/quotes',
  operationId: 'deleteQuote',
  summary: 'Delete a quote by id (passed as query parameter)',
  tags: ['quotes'],
  security: DEFAULT_SECURITY,
  request: { query: deleteQuerySchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: DeleteSuccessSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, listQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    const limit = queryValidation.data.limit ?? 100
    const offset = queryValidation.data.offset ?? 0

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const data = await withRLS((db) =>
      db.select()
        .from(quotes)
        .where(eq(quotes.userId, user.id))
        .orderBy(desc(quotes.createdAt))
        .limit(limit)
        .offset(offset)
    )

    return NextResponse.json(toSnakeCase(data))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
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
    console.error('API error:', err instanceof Error ? err.message : err)
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

    const data = await withRLS((db) =>
      db.update(quotes)
        .set({
          ...updates,
          updatedAt: sql`timezone('utc'::text, now())`
        })
        .where(and(eq(quotes.id, id), eq(quotes.userId, user.id)))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Quote not found or unauthorized', 404)
    }

    return NextResponse.json(toSnakeCase(data[0]))
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
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

    await withRLS((db) =>
      db.delete(quotes).where(and(eq(quotes.id, id), eq(quotes.userId, user.id)))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('API error:', err instanceof Error ? err.message : err)
    return createErrorResponse('Internal server error', 500)
  }
}
