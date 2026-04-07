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
import { z } from 'zod'
import { moduleTemplateEntries } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'

const CreateEntrySchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(500, 'Message must be 500 characters or fewer'),
})

const UpdateEntrySchema = z.object({
  id: z.string().uuid('Invalid entry id format'),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(500, 'Message must be 500 characters or fewer'),
})

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const DeleteQuerySchema = z.object({
  id: z.string().uuid('Invalid entry id format'),
})

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
      entries: toSnakeCase(entries) || [],
      count: entries?.length || 0,
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
