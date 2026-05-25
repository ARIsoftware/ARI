import { NextRequest, NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { generateApiKey } from '@/lib/api-keys'
import { apiKeys } from '@/lib/db/schema/core-schema'
import crypto from 'crypto'
import {
  createApiKeySchema,
  ApiKeyListResponseSchema,
  ApiKeyCreatedResponseSchema,
} from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/api-keys',
  operationId: 'listApiKeys',
  summary: "List the user's API keys (key hashes never returned)",
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'API keys (newest first)', content: { 'application/json': { schema: ApiKeyListResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/api-keys',
  operationId: 'createApiKey',
  summary: 'Create a new API key (raw_key returned once and only once)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: createApiKeySchema } } } },
  responses: {
    201: { description: 'Created key + raw value (store immediately, never recoverable)', content: { 'application/json': { schema: ApiKeyCreatedResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const keys = await withRLS((db) =>
      db
        .select({
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
        .from(apiKeys)
        .orderBy(desc(apiKeys.createdAt))
    )

    return NextResponse.json(toSnakeCase(keys))
  } catch (error) {
    console.error('Failed to list API keys:', error)
    return createErrorResponse('Failed to list API keys', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const validation = await validateRequestBody(request, createApiKeySchema)
    if (!validation.success) return validation.response

    const { label, expiresAt, allowedIps } = validation.data
    const { rawKey, keyHash, keyPrefix } = generateApiKey()
    const id = crypto.randomBytes(16).toString('hex')

    const [created] = await withRLS((db) =>
      db.insert(apiKeys).values({
        id,
        userId: user.id,
        label,
        keyHash,
        keyPrefix,
        expiresAt: expiresAt || null,
        allowedIps: allowedIps || null,
      }).returning({
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

    return NextResponse.json({
      key: toSnakeCase(created),
      raw_key: rawKey,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create API key:', error)
    return createErrorResponse('Failed to create API key', 500)
  }
}
