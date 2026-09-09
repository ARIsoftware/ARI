/**
 * Timeline Module - Events API
 *
 * PER-USER (private) data: every SELECT/UPDATE/DELETE filters by
 * `user_id = user.id` — this is the real tenant boundary (the default DB
 * role has BYPASSRLS; see docs/SECURITY.md).
 *
 * Endpoints:
 * - GET    /api/modules/timeline/events       - List the user's events
 * - POST   /api/modules/timeline/events       - Create an event
 * - PUT    /api/modules/timeline/events       - Update an event by id (id in body)
 * - DELETE /api/modules/timeline/events?id=x  - Delete an event by id
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validateQueryParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import {
  createEventSchema as CreateEventSchema,
  updateEventSchema as UpdateEventSchema,
  deleteEventQuerySchema as DeleteQuerySchema,
  listEventsQuerySchema as ListQuerySchema,
  EventListResponseSchema,
  EventSingleResponseSchema,
  EventDeleteResponseSchema,
} from '@/modules/timeline/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { timelineEvents } from '@/lib/db/schema'
import { and, asc, count, eq } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/timeline/events',
  operationId: 'listTimelineEvents',
  summary: 'List timeline events (paginated)',
  tags: ['timeline'],
  security: DEFAULT_SECURITY,
  request: { query: ListQuerySchema },
  responses: {
    200: { description: "Page of the user's timeline events", content: { 'application/json': { schema: EventListResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/timeline/events',
  operationId: 'createTimelineEvent',
  summary: 'Create a timeline event',
  tags: ['timeline'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateEventSchema } } } },
  responses: {
    201: { description: 'Created event', content: { 'application/json': { schema: EventSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/timeline/events',
  operationId: 'updateTimelineEvent',
  summary: 'Update a timeline event by id (id in body)',
  tags: ['timeline'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: UpdateEventSchema } } } },
  responses: {
    200: { description: 'Updated event', content: { 'application/json': { schema: EventSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Event not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/timeline/events',
  operationId: 'deleteTimelineEvent',
  summary: 'Delete a timeline event by id (id in query)',
  tags: ['timeline'],
  security: DEFAULT_SECURITY,
  request: { query: DeleteQuerySchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: EventDeleteResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Event not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, ListQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    // Default is generous: the chart needs every event in the fixed range.
    const limit = queryValidation.data.limit ?? 500
    const offset = queryValidation.data.offset ?? 0

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const { events, total } = await withRLS(async (db) => {
      const events = await db
        .select()
        .from(timelineEvents)
        // PER-USER boundary: only the caller's rows.
        .where(eq(timelineEvents.userId, user.id))
        .orderBy(asc(timelineEvents.eventDate))
        .limit(limit)
        .offset(offset)
      const [{ total }] = await db
        .select({ total: count() })
        .from(timelineEvents)
        .where(eq(timelineEvents.userId, user.id))
      return { events, total }
    })

    return NextResponse.json({
      events: toSnakeCase(events),
      count: events.length,
      total,
    })
  } catch (error) {
    console.error('GET /api/modules/timeline/events error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreateEventSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const data = await withRLS((db) =>
      db
        .insert(timelineEvents)
        .values({
          userId: user.id,
          name: validation.data.name,
          eventDate: validation.data.event_date,
          color: validation.data.color ?? null,
        })
        .returning()
    )

    return NextResponse.json({ event: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/timeline/events error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, UpdateEventSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const { id, name, event_date, color } = validation.data

    const data = await withRLS((db) =>
      db
        .update(timelineEvents)
        .set({ name, eventDate: event_date, color: color ?? null, updatedAt: new Date().toISOString() })
        // PER-USER boundary: you can only update your own row.
        .where(and(eq(timelineEvents.id, id), eq(timelineEvents.userId, user.id)))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Event not found', 404)
    }

    return NextResponse.json({ event: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PUT /api/modules/timeline/events error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, DeleteQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const deleted = await withRLS((db) =>
      db
        .delete(timelineEvents)
        // PER-USER boundary: you can only delete your own row.
        .where(and(eq(timelineEvents.id, queryValidation.data.id), eq(timelineEvents.userId, user.id)))
        .returning({ id: timelineEvents.id })
    )

    if (deleted.length === 0) {
      return createErrorResponse('Event not found', 404)
    }

    return NextResponse.json({ success: true, message: 'Event deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/modules/timeline/events error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
