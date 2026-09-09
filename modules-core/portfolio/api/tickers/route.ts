/**
 * Portfolio Module - Tickers API
 *
 * Endpoints:
 * - GET  /api/modules/portfolio/tickers  - List user's tickers
 * - POST /api/modules/portfolio/tickers  - Add a ticker
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validateQueryParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import { portfolioTickers } from '@/lib/db/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import {
  createTickerSchema as CreateTickerSchema,
  tickersQuerySchema as ListQuerySchema,
  TickerListResponseSchema,
  TickerSingleResponseSchema,
} from '../../lib/validation'
import { isUniqueViolation } from '../../lib/pg-errors'
import { registry } from '@/lib/openapi/registry'
import {
  DEFAULT_SECURITY,
  ErrorResponseSchema,
  InternalServerErrorResponse,
} from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/portfolio/tickers',
  operationId: 'listPortfolioTickers',
  summary: "List the user's portfolio tickers in playback order",
  tags: ['portfolio'],
  security: DEFAULT_SECURITY,
  request: { query: ListQuerySchema },
  responses: {
    200: {
      description: 'Tickers ordered by position then created_at',
      content: { 'application/json': { schema: TickerListResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/portfolio/tickers',
  operationId: 'addPortfolioTicker',
  summary: 'Add a ticker to the portfolio (symbol must be unique per user)',
  tags: ['portfolio'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateTickerSchema } } } },
  responses: {
    201: {
      description: 'Created ticker',
      content: { 'application/json': { schema: TickerSingleResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Ticker symbol already in portfolio',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, ListQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    const limit = queryValidation.data.limit ?? 500
    const offset = queryValidation.data.offset ?? 0

    const tickers = await withRLS((db) =>
      db
        .select()
        .from(portfolioTickers)
        .where(eq(portfolioTickers.userId, user.id))
        .orderBy(asc(portfolioTickers.position), asc(portfolioTickers.createdAt))
        .limit(limit)
        .offset(offset),
    )

    return NextResponse.json({
      tickers: toSnakeCase(tickers),
      count: tickers.length,
    })
  } catch (error) {
    console.error(
      'GET /api/modules/portfolio/tickers error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreateTickerSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const { symbol, shares } = validation.data

    // Fast-path duplicate check for a friendly 409; the unique index +
    // 23505 catch below is the authoritative guard against races.
    const existing = await withRLS((db) =>
      db
        .select({ id: portfolioTickers.id })
        .from(portfolioTickers)
        .where(and(eq(portfolioTickers.userId, user.id), eq(portfolioTickers.symbol, symbol)))
        .limit(1),
    )

    if (existing.length > 0) {
      return NextResponse.json({ error: `${symbol} is already in your portfolio` }, { status: 409 })
    }

    try {
      const data = await withRLS((db) =>
        db
          .insert(portfolioTickers)
          .values({
            userId: user.id,
            symbol,
            shares: shares == null ? null : shares.toString(),
            // Computed in the INSERT itself so concurrent adds can't both
            // read the same max and get duplicate positions.
            position: sql`(SELECT COALESCE(MAX(${portfolioTickers.position}) + 1, 0) FROM ${portfolioTickers} WHERE ${portfolioTickers.userId} = ${user.id})`,
          })
          .returning(),
      )

      return NextResponse.json({ ticker: toSnakeCase(data[0]) }, { status: 201 })
    } catch (insertError) {
      if (isUniqueViolation(insertError)) {
        return NextResponse.json(
          { error: `${symbol} is already in your portfolio` },
          { status: 409 },
        )
      }
      throw insertError
    }
  } catch (error) {
    console.error(
      'POST /api/modules/portfolio/tickers error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}
