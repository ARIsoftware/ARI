/**
 * Portfolio Module - Quotes API
 *
 * GET /api/modules/portfolio/quotes?symbols=AAPL,MSFT
 *
 * Returns live quotes from Yahoo Finance, cached server-side for 2 minutes.
 * Always returns 200 with per-symbol error fields so a single bad symbol
 * doesn't fail the whole batch.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateQueryParams, createErrorResponse } from '@/lib/api-helpers'
import { checkRateLimit } from '@/lib/modules/public-route-security'
import { getQuotes } from '../../lib/yahoo-finance'
import {
  SYMBOL_REGEX,
  MAX_SYMBOLS_PER_REQUEST,
  normalizeSymbol,
  quotesQuerySchema as QuerySchema,
  QuotesResponseSchema,
} from '../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import {
  DEFAULT_SECURITY,
  ErrorResponseSchema,
  InternalServerErrorResponse,
} from '@/lib/openapi/common'

// Per-user requests per minute. Each request can fan out up to 50 Yahoo
// fetches, so this caps the outbound amplification an authenticated caller
// can generate (Better Auth's rate limiter only covers /api/auth/*).
const MAX_REQUESTS_PER_MINUTE = 30

registry.registerPath({
  method: 'get',
  path: '/api/modules/portfolio/quotes',
  operationId: 'getPortfolioQuotes',
  summary:
    'Fetch live quotes from Yahoo Finance (cached server-side for 2 min). Always 200 with per-symbol error fields.',
  tags: ['portfolio'],
  security: DEFAULT_SECURITY,
  request: { query: QuerySchema },
  responses: {
    200: {
      description: 'Quotes (one per requested unique symbol)',
      content: { 'application/json': { schema: QuotesResponseSchema } },
    },
    400: {
      description: 'Too many symbols, or invalid symbol format',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Rate limit exceeded',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    if (!checkRateLimit(`portfolio-quotes:${user.id}`, MAX_REQUESTS_PER_MINUTE)) {
      return createErrorResponse('Too many requests, please slow down', 429)
    }

    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, QuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const raw = queryValidation.data.symbols
      .split(',')
      .map((s) => normalizeSymbol(s))
      .filter((s) => s.length > 0)

    if (raw.length === 0) {
      return NextResponse.json({ quotes: [] })
    }

    if (raw.length > MAX_SYMBOLS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many symbols (max ${MAX_SYMBOLS_PER_REQUEST})` },
        { status: 400 },
      )
    }

    // Don't echo the raw input back — it failed validation, so only report a count.
    const invalidCount = raw.filter((s) => !SYMBOL_REGEX.test(s)).length
    if (invalidCount > 0) {
      return NextResponse.json(
        { error: `${invalidCount} symbol(s) have an invalid format` },
        { status: 400 },
      )
    }

    const unique = Array.from(new Set(raw))
    const quotes = await getQuotes(unique)

    return NextResponse.json({ quotes })
  } catch (error) {
    console.error(
      'GET /api/modules/portfolio/quotes error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}
