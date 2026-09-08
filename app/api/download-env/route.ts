import { NextRequest, NextResponse } from "next/server"
import { writeFile, copyFile, access } from "fs/promises"
import path from "path"
import { requireAdminIfUsersExist } from "@/lib/auth-helpers"
import { isVercel } from "@/lib/deployment"
import { checkRateLimit, getClientIp, isSameOriginRequest } from "@/lib/modules/public-route-security"
import { welcomeEnvSaveRequestSchema, flattenZodErrors } from "@/lib/validation"
import { renderEnvFile } from "@/lib/env-file"
import { SaveEnvSuccessSchema } from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { ErrorResponseSchema } from "@/lib/openapi/common"

// Public during setup — guarded below by user-count check
export const isPublic = true

registry.registerPath({
  method: 'post',
  path: '/api/download-env',
  operationId: 'downloadEnv',
  summary: 'Write .env.local from the /welcome setup wizard. Public during setup; auth-gated once a user exists.',
  tags: ['app'],
  responses: {
    200: { description: 'Wrote .env.local successfully', content: { 'application/json': { schema: SaveEnvSuccessSchema } } },
    400: { description: 'Invalid input', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Cross-origin rejected', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'Rate limit exceeded', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

export async function POST(request: NextRequest) {
  // Vercel's filesystem is read-only — config is saved to the project's env
  // vars via /api/setup/vercel-configure instead.
  if (isVercel()) {
    return NextResponse.json(
      { error: "This deployment stores configuration in Vercel environment variables, not .env.local. Use the Vercel setup step in the welcome wizard." },
      { status: 400 }
    )
  }

  if (!checkRateLimit(`download-env:${getClientIp(request)}`, 3)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    )
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
  }

  const denied = await requireAdminIfUsersExist(request.headers)
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = welcomeEnvSaveRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: flattenZodErrors(parsed.error) },
      { status: 400 }
    )
  }

  const { localSupabaseDetected: _, dbMode, ...fields } = parsed.data
  const content = renderEnvFile(fields, { dbMode })

  const projectDir = process.cwd()
  const envPath = path.join(projectDir, ".env.local")

  try {
    await access(envPath)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = path.join(projectDir, `.env.local-backup-${timestamp}`)
    await copyFile(envPath, backupPath)
  } catch {
    // No existing file to back up
  }

  await writeFile(envPath, content, { encoding: "utf-8", mode: 0o600 })

  return NextResponse.json({ success: true, path: envPath })
}
