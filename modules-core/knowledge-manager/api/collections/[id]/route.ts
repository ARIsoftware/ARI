/**
 * Knowledge Manager Module - Individual Collection API Routes
 *
 * Endpoints:
 * - PATCH  /api/modules/knowledge-manager/collections/[id]  - Update collection
 * - DELETE /api/modules/knowledge-manager/collections/[id]  - Delete collection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import {
  updateCollectionSchema as UpdateCollectionSchema,
  collectionIdParamSchema,
  CollectionSingleResponseSchema,
  CollectionDeleteResponseSchema,
} from '@/modules/knowledge-manager/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { knowledgeCollections } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

registry.registerPath({
  method: 'patch',
  path: '/api/modules/knowledge-manager/collections/{id}',
  operationId: 'updateKnowledgeCollection',
  summary: 'Update a collection',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: {
    params: collectionIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateCollectionSchema } } },
  },
  responses: {
    200: { description: 'Updated collection', content: { 'application/json': { schema: CollectionSingleResponseSchema } } },
    400: { description: 'Validation error or no fields to update', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Collection not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/knowledge-manager/collections/{id}',
  operationId: 'deleteKnowledgeCollection',
  summary: 'Delete a collection (articles inside have collection_id set to NULL)',
  tags: ['knowledge-manager'],
  security: DEFAULT_SECURITY,
  request: { params: collectionIdParamSchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: CollectionDeleteResponseSchema } } },
    400: { description: 'Invalid id format', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * PATCH Handler - Update a collection
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parseResult = UpdateCollectionSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.issues
        },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}

    // Map API fields to Drizzle column names
    if (parseResult.data.name !== undefined) {
      updateData.name = parseResult.data.name
    }
    if (parseResult.data.color !== undefined) {
      updateData.color = parseResult.data.color
    }
    if (parseResult.data.icon !== undefined) {
      updateData.icon = parseResult.data.icon
    }
    if (parseResult.data.sort_order !== undefined) {
      updateData.sortOrder = parseResult.data.sort_order
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // RLS automatically ensures user can only update their own collections
    const collection = await withRLS((db) =>
      db.update(knowledgeCollections)
        .set(updateData)
        .where(eq(knowledgeCollections.id, id))
        .returning()
    )

    if (collection.length === 0) {
      return NextResponse.json(
        { error: 'Collection not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({ collection: toSnakeCase(collection[0]) })

  } catch (error) {
    console.error('PATCH /api/modules/knowledge-manager/collections/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE Handler - Delete a collection
 *
 * Note: Articles in this collection will have collection_id set to NULL (ON DELETE SET NULL)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    // RLS automatically ensures user can only delete their own collections
    await withRLS((db) =>
      db.delete(knowledgeCollections)
        .where(eq(knowledgeCollections.id, id))
    )

    return NextResponse.json({
      success: true,
      message: 'Collection deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/modules/knowledge-manager/collections/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
