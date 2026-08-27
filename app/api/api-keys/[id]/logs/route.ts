import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { apiKeys, apiKeyUsageLogs } from '@/lib/db/schema/core-schema'
import { appIdParamSchema, ApiKeyUsageLogListResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

registry.registerPath({
  method: 'get',
  path: '/api/api-keys/{id}/logs',
  operationId: 'listApiKeyUsageLogs',
  summary: 'List recent usage logs for one of your API keys (newest first)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { params: appIdParamSchema },
  responses: {
    200: { description: 'Usage log entries (newest first)', content: { 'application/json': { schema: ApiKeyUsageLogListResponseSchema } } },
    401: UnauthorizedResponse,
    404: { description: 'API key not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const { id } = await params

    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT

    // Ownership check — logs are only visible for keys the caller owns.
    const [key] = await withRLS((db) =>
      db
        .select({ id: apiKeys.id })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
        .limit(1)
    )
    if (!key) {
      return createErrorResponse('API key not found', 404)
    }

    const logs = await withRLS((db) =>
      db
        .select({
          id: apiKeyUsageLogs.id,
          endpoint: apiKeyUsageLogs.endpoint,
          method: apiKeyUsageLogs.method,
          statusCode: apiKeyUsageLogs.statusCode,
          ipAddress: apiKeyUsageLogs.ipAddress,
          userAgent: apiKeyUsageLogs.userAgent,
          createdAt: apiKeyUsageLogs.createdAt,
        })
        .from(apiKeyUsageLogs)
        .where(and(eq(apiKeyUsageLogs.apiKeyId, id), eq(apiKeyUsageLogs.userId, user.id)))
        .orderBy(desc(apiKeyUsageLogs.createdAt))
        .limit(limit)
    )

    return NextResponse.json(toSnakeCase(logs))
  } catch (error) {
    console.error('Failed to list API key usage logs:', error)
    return createErrorResponse('Failed to list API key usage logs', 500)
  }
}
