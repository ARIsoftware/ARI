/**
 * Timezones Module - People API Routes
 *
 * MULTI-USER — PER-USER (private): every read/write filters by
 * `user_id = user.id`, so each user only sees the people they added. That
 * filter is the real tenant boundary; the RLS policies in database/schema.sql
 * are defense-in-depth because the default DB role has BYPASSRLS
 * (see docs/SECURITY.md).
 *
 * Endpoints:
 * - GET  /api/modules/timezones/people  - List the caller's people
 * - POST /api/modules/timezones/people  - Add a person
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  createPersonSchema as CreatePersonSchema,
  PersonListResponseSchema,
  PersonSingleResponseSchema,
} from '@/modules/timezones/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { timezonePeople } from '@/lib/db/schema'
import { asc, eq, sql } from 'drizzle-orm'

/** Keeps one person's board from growing unbounded (and the row unrenderable). */
const MAX_PEOPLE = 30

registry.registerPath({
  method: 'get',
  path: '/api/modules/timezones/people',
  operationId: 'listTimezonePeople',
  summary: "List the caller's saved people and their time zones",
  tags: ['timezones'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'People in the order they were added', content: { 'application/json': { schema: PersonListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/timezones/people',
  operationId: 'createTimezonePerson',
  summary: 'Add a person with an IANA time zone',
  tags: ['timezones'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreatePersonSchema } } } },
  responses: {
    201: { description: 'Created person', content: { 'application/json': { schema: PersonSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    409: { description: 'Person limit reached', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    // Explicit projection rather than SELECT *: user_id is the caller's own id
    // and adds nothing to the payload.
    const people = await withRLS((db) =>
      db
        .select({
          id: timezonePeople.id,
          name: timezonePeople.name,
          timezone: timezonePeople.timezone,
          createdAt: timezonePeople.createdAt,
          updatedAt: timezonePeople.updatedAt,
        })
        .from(timezonePeople)
        .where(eq(timezonePeople.userId, user.id))
        .orderBy(asc(timezonePeople.createdAt))
    )

    // Deliberately unbounded: capping the list would hide rows past the cap
    // while they still counted against it, leaving them unviewable and
    // undeletable. POST is where the limit is enforced.
    return NextResponse.json({ people: toSnakeCase(people), count: people.length })
  } catch (error) {
    console.error('GET /api/modules/timezones/people error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate before parsing the body, so an unauthenticated caller gets a
    // 401 rather than a 400 that discloses the schema.
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const validation = await validateRequestBody(request, CreatePersonSchema)
    if (!validation.success) {
      return validation.response
    }

    const { name, timezone } = validation.data

    // Cap check and insert in one statement. A separate count-then-insert runs
    // as two transactions (withRLS commits per call), so two concurrent adds
    // could both read `total = 29` and both succeed. Every value below is a
    // bound parameter — no interpolation.
    const result = await withRLS((db) =>
      db.execute(sql`
        INSERT INTO timezone_people (user_id, name, timezone)
        SELECT ${user.id}, ${name}, ${timezone}
        WHERE (
          SELECT count(*) FROM timezone_people WHERE user_id = ${user.id}
        ) < ${MAX_PEOPLE}
        RETURNING id, user_id, name, timezone, created_at, updated_at
      `)
    )

    const created = (result as unknown as { rows: Record<string, unknown>[] }).rows

    if (!created || created.length === 0) {
      return createErrorResponse(
        `You can track up to ${MAX_PEOPLE} people — remove one to add another`,
        409
      )
    }

    // db.execute returns raw rows, which are already snake_case.
    return NextResponse.json({ person: created[0] }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/timezones/people error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
