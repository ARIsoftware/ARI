import { NextResponse } from "next/server"
import { existsSync } from "fs"
import path from "path"
import { getDbMode } from "@/lib/db/mode"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { ProjectDirResponseSchema } from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { DEFAULT_SECURITY, ErrorResponseSchema } from "@/lib/openapi/common"

export const debugRole = "project-dir"

registry.registerPath({
  method: 'get',
  path: '/api/project-dir',
  operationId: 'getProjectDir',
  summary: 'Diagnostic snapshot of project directory + DB mode + env-file status',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Project directory info', content: { 'application/json': { schema: ProjectDirResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnonKey = !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const hasServiceKey = !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  const hasDatabaseUrl = !!process.env.DATABASE_URL
  const isLocal = !!supabaseUrl && (supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost"))
  const envSupabaseLocalExists = existsSync(path.join(process.cwd(), ".env.supabase.local"))

  return NextResponse.json({
    dir: process.cwd(),
    dbMode: getDbMode(),
    envFileExists: existsSync(path.join(process.cwd(), ".env.local")),
    hasDatabaseUrl,
    // Keep localSupabase for backward compat during transition
    localSupabase: {
      detected: isLocal && hasAnonKey && hasServiceKey && hasDatabaseUrl,
      envFileExists: envSupabaseLocalExists,
      hasUrl: !!supabaseUrl,
      hasKeys: hasAnonKey && hasServiceKey,
      hasDatabaseUrl,
    },
  })
}
