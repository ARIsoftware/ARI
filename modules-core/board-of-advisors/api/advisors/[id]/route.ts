/**
 * Board of Advisors — single advisor routes.
 * PATCH  /api/modules/board-of-advisors/advisors/{id}  → { advisor }
 * DELETE /api/modules/board-of-advisors/advisors/{id}  → { success }
 *
 * Deleting an advisor keeps their past replies: board_messages.advisor_id is
 * set NULL by the FK, and the advisor_name/advisor_color snapshots still render.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, validatePathParams, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  updateAdvisorSchema,
  advisorIdParamSchema,
  AdvisorSingleResponseSchema,
  DeleteResponseSchema,
} from '@/modules/board-of-advisors/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { boardAdvisors } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'patch',
  path: '/api/modules/board-of-advisors/advisors/{id}',
  operationId: 'updateBoardAdvisor',
  summary: "Update an advisor's name and/or personality description",
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { params: advisorIdParamSchema, body: { content: { 'application/json': { schema: updateAdvisorSchema } } } },
  responses: {
    200: { description: 'Updated advisor', content: { 'application/json': { schema: AdvisorSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Advisor not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/board-of-advisors/advisors/{id}',
  operationId: 'deleteBoardAdvisor',
  summary: 'Remove an advisor from the board (their past replies are kept)',
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  request: { params: advisorIdParamSchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: DeleteResponseSchema } } },
    400: { description: 'Invalid advisor id', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Advisor not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = validatePathParams(await context.params, advisorIdParamSchema)
    if (!params.success) return params.response
    const { id } = params.data

    const validation = await validateRequestBody(request, updateAdvisorSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const updated = await withRLS((db) =>
      db
        .update(boardAdvisors)
        .set({
          ...(validation.data.name !== undefined ? { name: validation.data.name } : {}),
          ...(validation.data.description !== undefined ? { description: validation.data.description } : {}),
          updatedAt: sql`now()`,
        })
        .where(and(eq(boardAdvisors.id, id), eq(boardAdvisors.userId, user.id)))
        .returning()
    )

    if (updated.length === 0) {
      return createErrorResponse('Advisor not found', 404)
    }

    return NextResponse.json({ advisor: toSnakeCase(updated[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/board-of-advisors/advisors/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = validatePathParams(await context.params, advisorIdParamSchema)
    if (!params.success) return params.response
    const { id } = params.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const deleted = await withRLS((db) =>
      db
        .delete(boardAdvisors)
        .where(and(eq(boardAdvisors.id, id), eq(boardAdvisors.userId, user.id)))
        .returning({ id: boardAdvisors.id })
    )

    if (deleted.length === 0) {
      return createErrorResponse('Advisor not found', 404)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/board-of-advisors/advisors/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
