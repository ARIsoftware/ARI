import { NextRequest, NextResponse } from "next/server"
import { writeFile, copyFile, access } from "fs/promises"
import path from "path"
import { requireAuthIfUsersExist } from "@/lib/auth-helpers"

// Public during setup — guarded below by user-count check
export const isPublic = true

export async function POST(request: NextRequest) {
  const denied = await requireAuthIfUsersExist(request.headers)
  if (denied) return denied

  const { content } = await request.json()

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "Missing content" }, { status: 400 })
  }

  const projectDir = process.cwd()
  const envPath = path.join(projectDir, ".env.local")

  // Check if .env.local already exists and back it up
  try {
    await access(envPath)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = path.join(projectDir, `.env.local-backup-${timestamp}`)
    await copyFile(envPath, backupPath)
  } catch {
    // File doesn't exist, no backup needed
  }

  // Write the new .env.local
  await writeFile(envPath, content, "utf-8")

  return NextResponse.json({
    success: true,
    path: envPath,
  })
}
