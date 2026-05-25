import { NextResponse } from "next/server"
import { pool } from "@/lib/db/pool"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { safeErrorResponse } from "@/lib/api-error"
import { HealthCheckSchema } from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { DEFAULT_SECURITY, ErrorResponseSchema, UnauthorizedResponse } from "@/lib/openapi/common"

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

export async function GET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const checks: Record<string, { status: "ok" | "error"; message?: string }> = {}

  // Database check
  try {
    if (!pool) {
      checks.database = { status: "error", message: "DATABASE_URL not configured" }
    } else {
      const client = await pool.connect()
      try {
        await client.query("SELECT 1")
        checks.database = { status: "ok" }
      } finally {
        client.release()
      }
    }
  } catch (err) {
    checks.database = {
      status: "error",
      message: safeErrorResponse(err),
    }
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok")

  return NextResponse.json(
    { status: allOk ? "ok" : "error", checks },
    { status: allOk ? 200 : 503 }
  )
}
