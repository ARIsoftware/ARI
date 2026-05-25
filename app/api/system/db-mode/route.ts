import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { getDbMode } from "@/lib/db/mode"
import { DbModeResponseSchema } from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { DEFAULT_SECURITY, ErrorResponseSchema } from "@/lib/openapi/common"

export const debugRole = "system-db-mode"

registry.registerPath({
  method: 'get',
  path: '/api/system/db-mode',
  operationId: 'getDbMode',
  summary: 'Return the active database mode (postgres | supabaselocal | supabasecloud)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'DB mode', content: { 'application/json': { schema: DbModeResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ mode: getDbMode() })
}
