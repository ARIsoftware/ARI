import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { checkDatabase } from "@/lib/health/checks"
import { HealthCheckSchema } from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { DEFAULT_SECURITY, ErrorResponseSchema, UnauthorizedResponse } from "@/lib/openapi/common"
import { withApiLogging } from '@/lib/api-logging'

export const dynamic = "force-dynamic"
// Identifier consumed by /health via the manifest — do not rename without
// updating any callers that look this role up.
export const debugRole = "health-database"

registry.registerPath({
  method: 'get',
  path: '/api/health',
  operationId: 'healthCheck',
  summary: 'Database connectivity health check',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'All checks passed', content: { 'application/json': { schema: HealthCheckSchema } } },
    401: UnauthorizedResponse,
    503: { description: 'One or more checks failed', content: { 'application/json': { schema: HealthCheckSchema } } },
  },
})

async function handleGET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const result = await checkDatabase()
  return NextResponse.json(result, { status: result.status === 'ok' ? 200 : 503 })
}

export const GET = withApiLogging(handleGET)
