import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { requireAdmin } from "@/lib/api-helpers"
import { getAriInstance, setTelemetryEnabled } from "@/lib/telemetry/instance"
import { updateTelemetrySchema, TelemetryResponseSchema } from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { DEFAULT_SECURITY, ErrorResponseSchema } from "@/lib/openapi/common"
import { withApiLogging } from '@/lib/api-logging'

registry.registerPath({
  method: 'get',
  path: '/api/telemetry',
  operationId: 'getTelemetryStatus',
  summary: 'Get telemetry enabled/disabled state',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Telemetry status', content: { 'application/json': { schema: TelemetryResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Telemetry instance unavailable', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/telemetry',
  operationId: 'setTelemetryEnabled',
  summary: 'Enable or disable telemetry',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: updateTelemetrySchema } } } },
  responses: {
    200: { description: 'New telemetry state', content: { 'application/json': { schema: TelemetryResponseSchema } } },
    400: { description: 'Invalid body', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

async function handleGET() {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const instance = await getAriInstance()
  if (!instance) return NextResponse.json({ error: "Unavailable" }, { status: 500 })
  return NextResponse.json({ telemetryEnabled: instance.telemetryEnabled })
}

async function handlePUT(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Telemetry is a per-install setting, not per-user — admin only.
  const denied = requireAdmin(user, "Admin access required")
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  await setTelemetryEnabled(body.enabled)
  return NextResponse.json({ telemetryEnabled: body.enabled })
}

export const GET = withApiLogging(handleGET)
export const PUT = withApiLogging(handlePUT)
