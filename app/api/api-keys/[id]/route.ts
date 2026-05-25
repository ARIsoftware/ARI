import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { apiKeys } from '@/lib/db/schema/core-schema'
import {
  appIdParamSchema,
  updateApiKeySchema,
  ApiKeySchema,
  SuccessSchema,
} from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'patch',
  path: '/api/api-keys/{id}',
  operationId: 'updateApiKey',
  summary: 'Update an API key (label, expiry, IP allowlist)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: {
    params: appIdParamSchema,
    body: { content: { 'application/json': { schema: updateApiKeySchema } } },
  },
  responses: {
    200: { description: 'Updated key', content: { 'application/json': { schema: ApiKeySchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'API key not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/api-keys/{id}',
  operationId: 'deleteApiKey',
  summary: 'Revoke (delete) an API key',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { params: appIdParamSchema },
  responses: {
    200: { description: 'Revocation acknowledged', content: { 'application/json': { schema: SuccessSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'API key not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { id } = await params
    const validation = await validateRequestBody(request, updateApiKeySchema)
    if (!validation.success) return validation.response

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (validation.data.label !== undefined) updates.label = validation.data.label
    if (validation.data.expiresAt !== undefined) updates.expiresAt = validation.data.expiresAt
    if (validation.data.allowedIps !== undefined) updates.allowedIps = validation.data.allowedIps

    const [updated] = await withRLS((db) =>
      db
        .update(apiKeys)
        .set(updates)
        .where(eq(apiKeys.id, id))
        .returning({
          id: apiKeys.id,
          label: apiKeys.label,
          keyPrefix: apiKeys.keyPrefix,
          expiresAt: apiKeys.expiresAt,
          allowedIps: apiKeys.allowedIps,
          lastUsedAt: apiKeys.lastUsedAt,
          requestCount: apiKeys.requestCount,
          revoked: apiKeys.revoked,
          createdAt: apiKeys.createdAt,
        })
    )

    if (!updated) {
      return createErrorResponse('API key not found', 404)
    }

    return NextResponse.json(toSnakeCase(updated))
  } catch (error) {
    console.error('Failed to update API key:', error)
    return createErrorResponse('Failed to update API key', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { id } = await params

    const [deleted] = await withRLS((db) =>
      db
        .delete(apiKeys)
        .where(eq(apiKeys.id, id))
        .returning({ id: apiKeys.id })
    )

    if (!deleted) {
      return createErrorResponse('API key not found', 404)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to revoke API key:', error)
    return createErrorResponse('Failed to revoke API key', 500)
  }
}
