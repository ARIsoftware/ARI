/**
 * Board of Advisors — advisor collection routes.
 * GET  /api/modules/board-of-advisors/advisors  → { advisors } (speaking order)
 * POST /api/modules/board-of-advisors/advisors  → { advisor } (appended last)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  createAdvisorSchema,
  AdvisorListResponseSchema,
  AdvisorSingleResponseSchema,
} from '@/modules/board-of-advisors/lib/validation'
import { pickAdvisorColor } from '@/modules/board-of-advisors/lib/utils'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { boardAdvisors } from '@/lib/db/schema'
import { asc, count, eq, max } from 'drizzle-orm'

const MAX_ADVISORS = 100

registry.registerPath({
  method: 'get',
  path: '/api/modules/board-of-advisors/advisors',
  operationId: 'listBoardAdvisors',
  summary: 'List advisors in speaking order',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Advisors ordered by sort_order', content: { 'application/json': { schema: AdvisorListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/board-of-advisors/advisors',
  operationId: 'createBoardAdvisor',
  summary: 'Add an advisor to the board (appended to the end of the speaking order)',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: createAdvisorSchema } } } },
  responses: {
    201: { description: 'Created advisor', content: { 'application/json': { schema: AdvisorSingleResponseSchema } } },
    400: { description: 'Validation error or board is full', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const advisors = await withRLS((db) =>
      db
        .select()
        .from(boardAdvisors)
        .where(eq(boardAdvisors.userId, user.id))
        .orderBy(asc(boardAdvisors.sortOrder), asc(boardAdvisors.createdAt))
    )

    return NextResponse.json({ advisors: toSnakeCase(advisors) })
  } catch (error) {
    console.error('GET /api/modules/board-of-advisors/advisors error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, createAdvisorSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const created = await withRLS(async (db) => {
      const [{ total, maxOrder }] = await db
        .select({ total: count(), maxOrder: max(boardAdvisors.sortOrder) })
        .from(boardAdvisors)
        .where(eq(boardAdvisors.userId, user.id))
      if (total >= MAX_ADVISORS) return null

      return db
        .insert(boardAdvisors)
        .values({
          userId: user.id,
          name: validation.data.name,
          description: validation.data.description,
          color: pickAdvisorColor(total),
          sortOrder: maxOrder === null ? 0 : maxOrder + 1,
        })
        .returning()
    })

    if (!created) {
      return createErrorResponse(`Your board is full — the maximum is ${MAX_ADVISORS} advisors.`, 400)
    }

    return NextResponse.json({ advisor: toSnakeCase(created[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/board-of-advisors/advisors error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
