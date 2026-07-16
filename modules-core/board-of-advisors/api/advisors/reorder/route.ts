/**
 * Board of Advisors — speaking-order route.
 * PUT /api/modules/board-of-advisors/advisors/reorder  → { success }
 *
 * Body is the full list of advisor ids in the desired speaking order.
 * Individual update().where() calls via Promise.all (not an array-cast SQL
 * statement) per ARI's Drizzle conventions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  reorderAdvisorsSchema,
  DeleteResponseSchema,
} from '@/modules/board-of-advisors/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { boardAdvisors } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'put',
  path: '/api/modules/board-of-advisors/advisors/reorder',
  operationId: 'reorderBoardAdvisors',
  summary: 'Set the advisor speaking order (full list of advisor ids, first speaks first)',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: reorderAdvisorsSchema } } } },
  responses: {
    200: { description: 'Order saved', content: { 'application/json': { schema: DeleteResponseSchema } } },
    400: { description: 'Validation error or unknown advisor id', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, reorderAdvisorsSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const ids = validation.data.order
    if (new Set(ids).size !== ids.length) {
      return createErrorResponse('Order contains duplicate advisor ids', 400)
    }

    // Each update is scoped to (id, user_id). Throwing inside withRLS rolls
    // the whole transaction back, so an unknown id leaves the order untouched.
    let unknownId = false
    await withRLS(async (db) => {
      const results = await Promise.all(
        ids.map((id, index) =>
          db
            .update(boardAdvisors)
            .set({ sortOrder: index, updatedAt: sql`now()` })
            .where(and(eq(boardAdvisors.id, id), eq(boardAdvisors.userId, user.id)))
            .returning({ id: boardAdvisors.id })
        )
      )
      if (results.some((r) => r.length === 0)) {
        unknownId = true
        throw new Error('reorder: unknown advisor id')
      }
    }).catch((err) => {
      if (!unknownId) throw err
    })

    if (unknownId) {
      return createErrorResponse('One or more advisor ids were not found', 400)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/modules/board-of-advisors/advisors/reorder error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
