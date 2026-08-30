/**
 * Timezones Module - Individual Person API Routes
 *
 * PER-USER (private): both handlers scope by `user_id = user.id` in addition to
 * the row id, so one user can never touch another user's person.
 *
 * Endpoints:
 * - PATCH  /api/modules/timezones/people/[id]  - Rename or re-zone a person
 * - DELETE /api/modules/timezones/people/[id]  - Remove a person
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  updatePersonSchema as UpdatePersonSchema,
  personIdParamSchema,
  PersonSingleResponseSchema,
  PersonDeleteResponseSchema,
} from '@/modules/timezones/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { timezonePeople } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'patch',
  path: '/api/modules/timezones/people/{id}',
  operationId: 'updateTimezonePerson',
  summary: "Update a person's name and/or time zone",
  tags: ['timezones'],
  security: DEFAULT_SECURITY,
  request: {
    params: personIdParamSchema,
    body: { content: { 'application/json': { schema: UpdatePersonSchema } } },
  },
  responses: {
    200: { description: 'Updated person', content: { 'application/json': { schema: PersonSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Person not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/timezones/people/{id}',
  operationId: 'deleteTimezonePerson',
  summary: 'Remove a person from the board',
  tags: ['timezones'],
  security: DEFAULT_SECURITY,
  request: { params: personIdParamSchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: PersonDeleteResponseSchema } } },
    400: { description: 'Invalid id format', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Person not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Authenticate before parsing the body, so an unauthenticated caller gets a
    // 401 rather than a 400 that discloses the schema.
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const idValidation = personIdParamSchema.safeParse(await params)
    if (!idValidation.success) {
      return createErrorResponse('Invalid person id format', 400)
    }

    const validation = await validateRequestBody(request, UpdatePersonSchema)
    if (!validation.success) {
      return validation.response
    }

    const updated = await withRLS((db) =>
      db
        .update(timezonePeople)
        .set({ ...validation.data, updatedAt: sql`now()` })
        .where(
          and(eq(timezonePeople.id, idValidation.data.id), eq(timezonePeople.userId, user.id))
        )
        .returning()
    )

    if (updated.length === 0) {
      return createErrorResponse('Person not found', 404)
    }

    return NextResponse.json({ person: toSnakeCase(updated[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/timezones/people/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const idValidation = personIdParamSchema.safeParse(await params)
    if (!idValidation.success) {
      return createErrorResponse('Invalid person id format', 400)
    }

    // .returning() so an unknown id (or someone else's row) reports 404 instead
    // of a success the caller can't distinguish from a real delete.
    const deleted = await withRLS((db) =>
      db
        .delete(timezonePeople)
        .where(
          and(eq(timezonePeople.id, idValidation.data.id), eq(timezonePeople.userId, user.id))
        )
        .returning({ id: timezonePeople.id })
    )

    if (deleted.length === 0) {
      return createErrorResponse('Person not found', 404)
    }

    return NextResponse.json({ success: true, message: 'Person removed successfully' })
  } catch (error) {
    console.error('DELETE /api/modules/timezones/people/[id] error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
