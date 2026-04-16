import { NextRequest, NextResponse } from "next/server"
import { writeFile, copyFile, access } from "fs/promises"
import path from "path"
import { requireAuthIfUsersExist } from "@/lib/auth-helpers"
import { checkRateLimit, getClientIp } from "@/lib/modules/public-route-security"
import { welcomeEnvSaveRequestSchema, flattenZodErrors } from "@/lib/validation"
import { renderEnvFile } from "@/lib/env-file"

// Public during setup — guarded below by user-count check
export const isPublic = true

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`download-env:${getClientIp(request)}`, 3)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    )
  }

  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")
  if (!origin && !referer) {
    return NextResponse.json({ error: "Missing origin header" }, { status: 400 })
  }

  const denied = await requireAuthIfUsersExist(request.headers)
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

  const { localSupabaseDetected, ...fields } = parsed.data
  const content = renderEnvFile(fields, { localSupabaseDetected })

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

  await writeFile(envPath, content, "utf-8")

  return NextResponse.json({ success: true, path: envPath })
}
