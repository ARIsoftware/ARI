import { NextRequest, NextResponse } from "next/server"
import { writeFile, copyFile, access } from "fs/promises"
import path from "path"
import { pool } from "@/lib/db/pool"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

// Public during setup — guarded below by user-count check
export const isPublic = true

export async function POST(request: NextRequest) {
  // Guard: only allow if no users exist OR the caller is authenticated
  let hasUsers = false
  if (pool) {
    try {
      const result = await pool.query('SELECT EXISTS(SELECT 1 FROM public."user") AS has_users')
      hasUsers = result.rows[0]?.has_users === true
    } catch {
      // Table may not exist yet — that's fine, no users
    }
  }

  if (hasUsers) {
    // Users exist — require authentication
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

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
