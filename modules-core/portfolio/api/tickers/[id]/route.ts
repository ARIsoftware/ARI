/**
 * Portfolio Module - Ticker by ID API
 *
 * Endpoints:
 * - PATCH  /api/modules/portfolio/tickers/[id] - Update position (reorder)
 * - DELETE /api/modules/portfolio/tickers/[id] - Remove ticker
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validatePathParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import { portfolioTickers } from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import {
  tickerIdParamSchema as ParamsSchema,
  updateTickerSchema as PatchSchema,
  TickerSingleResponseSchema,
  TickerDeleteResponseSchema,
} from '../../../lib/validation'
import { isUniqueViolation } from '../../../lib/pg-errors'
import { registry } from '@/lib/openapi/registry'
import {
  DEFAULT_SECURITY,
  ErrorResponseSchema,
  InternalServerErrorResponse,
} from '@/lib/openapi/common'

registry.registerPath({
  method: 'patch',
  path: '/api/modules/portfolio/tickers/{id}',
  operationId: 'updatePortfolioTicker',
  summary: 'Update a portfolio ticker (any of position, symbol, shares)',
  tags: ['portfolio'],
  security: DEFAULT_SECURITY,
  request: {
    params: ParamsSchema,
    body: { content: { 'application/json': { schema: PatchSchema } } },
  },
  responses: {
    200: {
      description: 'Updated ticker',
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
    404: {
      description: 'Ticker not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Renamed symbol conflicts with another row',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/portfolio/tickers/{id}',
  operationId: 'deletePortfolioTicker',
  summary: 'Remove a ticker from the portfolio',
  tags: ['portfolio'],
  security: DEFAULT_SECURITY,
  request: { params: ParamsSchema },
  responses: {
    200: {
      description: 'Deletion acknowledged',
      content: { 'application/json': { schema: TickerDeleteResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Ticker not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: InternalServerErrorResponse,
  },
})

async function resolveId(context: { params: Promise<Record<string, string | string[]>> }) {
  const params = await context.params
  return validatePathParams(params, ParamsSchema)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const idValidation = await resolveId(context)
    if (!idValidation.success) {
      return idValidation.response
    }

    const bodyValidation = await validateRequestBody(request, PatchSchema)
    if (!bodyValidation.success) {
      return bodyValidation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const { position, symbol, shares } = bodyValidation.data
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (position !== undefined) updates.position = position
    if (symbol !== undefined) updates.symbol = symbol
    if (shares !== undefined) updates.shares = shares == null ? null : shares.toString()

    if (symbol !== undefined) {
      const duplicate = await withRLS((db) =>
        db
          .select({ id: portfolioTickers.id })
          .from(portfolioTickers)
          .where(
            and(
              eq(portfolioTickers.userId, user.id),
              eq(portfolioTickers.symbol, symbol),
              ne(portfolioTickers.id, idValidation.data.id),
            ),
          )
          .limit(1),
      )
      if (duplicate.length > 0) {
        return NextResponse.json(
          { error: `${symbol} is already in your portfolio` },
          { status: 409 },
        )
      }
    }

    let updated
    try {
      updated = await withRLS((db) =>
        db
          .update(portfolioTickers)
          .set(updates)
          .where(
            and(
              eq(portfolioTickers.id, idValidation.data.id),
              eq(portfolioTickers.userId, user.id),
            ),
          )
          .returning(),
      )
    } catch (updateError) {
      // A rename that races past the duplicate pre-check hits the unique
      // index — report it as the documented 409, not a 500.
      if (symbol !== undefined && isUniqueViolation(updateError)) {
        return NextResponse.json(
          { error: `${symbol} is already in your portfolio` },
          { status: 409 },
        )
      }
      throw updateError
    }

    if (updated.length === 0) {
      return createErrorResponse('Ticker not found', 404)
    }

    return NextResponse.json({ ticker: toSnakeCase(updated[0]) })
  } catch (error) {
    console.error(
      'PATCH /api/modules/portfolio/tickers/[id] error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const idValidation = await resolveId(context)
    if (!idValidation.success) {
      return idValidation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const deleted = await withRLS((db) =>
      db
        .delete(portfolioTickers)
        .where(
          and(eq(portfolioTickers.id, idValidation.data.id), eq(portfolioTickers.userId, user.id)),
        )
        .returning({ id: portfolioTickers.id }),
    )

    if (deleted.length === 0) {
      return createErrorResponse('Ticker not found', 404)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(
      'DELETE /api/modules/portfolio/tickers/[id] error:',
      error instanceof Error ? error.message : error,
    )
    return createErrorResponse('Internal server error', 500)
  }
}
