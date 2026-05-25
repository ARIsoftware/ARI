/**
 * Module Template Module - Data API Routes
 *
 * Reference template demonstrating ARI's API conventions:
 * - `validateRequestBody` / `validateQueryParams` for input validation
 * - `getAuthenticatedUser()` + `withRLS()` for tenant isolation
 * - Defense-in-depth: explicit `user_id` filters in addition to RLS
 * - `createErrorResponse` + safe error logging
 * - All four CRUD verbs (GET / POST / PUT / DELETE)
 *
 * Endpoints:
 * - GET    /api/modules/module-template/data       - List entries (paginated)
 * - POST   /api/modules/module-template/data       - Create new entry
 * - PUT    /api/modules/module-template/data       - Update an entry by id
 * - DELETE /api/modules/module-template/data?id=x  - Delete entry by id
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
  createEntrySchema as CreateEntrySchema,
  updateEntrySchema as UpdateEntrySchema,
  listEntriesQuerySchema as ListQuerySchema,
  deleteEntryQuerySchema as DeleteQuerySchema,
  EntryListResponseSchema,
  EntrySingleResponseSchema,
  EntryDeleteResponseSchema,
} from '@/modules/module-template/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleTemplateEntries } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/module-template/data',
  operationId: 'listModuleTemplateEntries',
  summary: 'List module-template entries (paginated)',
  tags: ['module-template'],
  security: DEFAULT_SECURITY,
  request: { query: ListQuerySchema },
  responses: {
    200: { description: "Page of the user's entries", content: { 'application/json': { schema: EntryListResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/module-template/data',
  operationId: 'createModuleTemplateEntry',
  summary: 'Create a new module-template entry',
  tags: ['module-template'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateEntrySchema } } } },
  responses: {
    201: { description: 'Created entry', content: { 'application/json': { schema: EntrySingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/module-template/data',
  operationId: 'updateModuleTemplateEntry',
  summary: 'Update an entry by id (id in body)',
  tags: ['module-template'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: UpdateEntrySchema } } } },
  responses: {
    200: { description: 'Updated entry', content: { 'application/json': { schema: EntrySingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Entry not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/module-template/data',
  operationId: 'deleteModuleTemplateEntry',
  summary: 'Delete an entry by id (id in query)',
  tags: ['module-template'],
  security: DEFAULT_SECURITY,
  request: { query: DeleteQuerySchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: EntryDeleteResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

// ─── Drizzle Query Quick Reference ─────────────────────────────────────
// This route demonstrates basic CRUD. Here are additional query patterns
// you may need (all run inside withRLS()):
//
// OPERATORS (import from "drizzle-orm"):
//   or(eq(t.status, 'a'), eq(t.status, 'b'))     → status = 'a' OR status = 'b'
//   like(t.title, '%search%')                     → title LIKE '%search%'
//   ilike(t.title, '%search%')                    → case-insensitive LIKE
//   isNull(t.deletedAt)                           → deleted_at IS NULL
//   not(eq(t.status, 'archived'))                 → status != 'archived'
//   inArray(t.id, ['a','b','c'])                  → id IN ('a','b','c')
//   between(t.score, 1, 10)                       → score BETWEEN 1 AND 10
//   sql`${t.name} ILIKE ${'%' + q + '%'}`         → raw SQL escape hatch
//
// COUNT:
//   import { count } from 'drizzle-orm'
//   const [{ total }] = await withRLS(db =>
//     db.select({ total: count() }).from(myTable)
//   )
//
// SELECT SPECIFIC COLUMNS:
//   await withRLS(db =>
//     db.select({ id: t.id, title: t.title }).from(t)
//   )
//
// UPSERT (on conflict):
//   await withRLS(db =>
//     db.insert(t).values({ userId: user.id, key: 'k', value: 'v' })
//       .onConflictDoUpdate({
//         target: [t.userId, t.key],
//         set: { value: 'v', updatedAt: sql`now()` },
//       })
//   )
// ────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, ListQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }
    const limit = queryValidation.data.limit ?? 100
    const offset = queryValidation.data.offset ?? 0

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

const entries = await withRLS((db) =>
      db
        .select()
        .from(moduleTemplateEntries)
        .where(eq(moduleTemplateEntries.userId, user.id))
        .orderBy(desc(moduleTemplateEntries.createdAt))
        .limit(limit)
        .offset(offset)
    )

    return NextResponse.json({
      entries: toSnakeCase(entries),
      count: entries.length,
    })
  } catch (error) {
    console.error('GET /api/modules/module-template/data error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreateEntrySchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    // INSERT requires explicit user_id (RLS validates but does not auto-populate).
    const data = await withRLS((db) =>
      db
        .insert(moduleTemplateEntries)
        .values({
          userId: user.id,
          message: validation.data.message,
        })
        .returning()
    )

    return NextResponse.json({ entry: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/module-template/data error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, UpdateEntrySchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const { id, message } = validation.data

const data = await withRLS((db) =>
      db
        .update(moduleTemplateEntries)
        .set({ message, updatedAt: new Date().toISOString() })
        .where(and(eq(moduleTemplateEntries.id, id), eq(moduleTemplateEntries.userId, user.id)))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Entry not found', 404)
    }

    return NextResponse.json({ entry: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PUT /api/modules/module-template/data error:', error instanceof Error ? error.message : error)
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

await withRLS((db) =>
      db
        .delete(moduleTemplateEntries)
        .where(and(eq(moduleTemplateEntries.id, queryValidation.data.id), eq(moduleTemplateEntries.userId, user.id)))
    )

    return NextResponse.json({ success: true, message: 'Entry deleted successfully' })
  } catch (error) {
    console.error('DELETE /api/modules/module-template/data error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
