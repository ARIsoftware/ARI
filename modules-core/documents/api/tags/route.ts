/**
 * Documents Module - Tags API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/tags - List all tags
 * - POST /api/modules/documents/tags - Create new tag
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase, validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { documents, documentTags, documentTagAssignments } from '@/lib/db/schema'
import { count, eq, and } from 'drizzle-orm'
import {
  createTagSchema as CreateTagSchema,
  TagListResponseSchema,
  TagSingleResponseSchema,
} from '../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/documents/tags',
  operationId: 'listDocumentTags',
  summary: "List the user's document tags with usage counts",
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Tags with usage counts', content: { 'application/json': { schema: TagListResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/documents/tags',
  operationId: 'createDocumentTag',
  summary: 'Create a document tag (name must be unique per user)',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateTagSchema } } } },
  responses: {
    201: { description: 'Created tag', content: { 'application/json': { schema: TagSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    409: { description: 'Tag name already exists for this user', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * GET Handler - List all tags
 */
export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    // Fetch user's tags
    const tags = await withRLS((db) =>
      db.select()
        .from(documentTags)
        .where(eq(documentTags.userId, user.id))
        .orderBy(documentTags.name)
    )

    // Get usage count per tag (only assignments on documents owned by the user)
    const usageCounts = await withRLS((db) =>
      db.select({
        tagId: documentTagAssignments.tagId,
        count: count(documentTagAssignments.id),
      })
        .from(documentTagAssignments)
        .innerJoin(documents, eq(documentTagAssignments.documentId, documents.id))
        .where(eq(documents.userId, user.id))
        .groupBy(documentTagAssignments.tagId)
    )

    const usageMap = new Map<string, number>()
    usageCounts.forEach((row: any) => {
      usageMap.set(row.tagId, Number(row.count))
    })

    const tagsWithCounts = tags.map((tag: any) => ({
      ...tag,
      usage_count: usageMap.get(tag.id) || 0,
    }))

    return NextResponse.json({
      tags: toSnakeCase(tagsWithCounts),
      count: tags.length,
    })

  } catch (error) {
    console.error('GET /api/modules/documents/tags error:', error)
    return createErrorResponse('Internal server error')
  }
}

/**
 * POST Handler - Create new tag
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const validation = await validateRequestBody(request, CreateTagSchema)
    if (!validation.success) return validation.response

    const { name, color } = validation.data

    // Check if user already has a tag with this name
    const existing = await withRLS((db) =>
      db.select()
        .from(documentTags)
        .where(and(
          eq(documentTags.userId, user.id),
          eq(documentTags.name, name)
        ))
        .limit(1)
    )

    if (existing.length > 0) {
      return createErrorResponse('A tag with this name already exists', 409)
    }

    // Create tag
    const newTag = await withRLS((db) =>
      db.insert(documentTags)
        .values({
          userId: user.id,
          name,
          color,
        })
        .returning()
    )

    return NextResponse.json(
      { tag: toSnakeCase(newTag[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/documents/tags error:', error)
    return createErrorResponse('Internal server error')
  }
}
