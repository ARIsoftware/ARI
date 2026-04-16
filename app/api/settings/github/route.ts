import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile, copyFile, access } from "fs/promises"
import path from "path"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { upsertEnvVars } from "@/lib/env-file"

/**
 * GET: Return current GitHub Sync configuration (owner + repo name + whether a token is set).
 * The token itself is never returned for security.
 */
export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({
    hasToken: !!process.env.GITHUB_TOKEN,
    repoOwner: process.env.GITHUB_REPO_OWNER ?? "",
    repoName: process.env.GITHUB_REPO_NAME ?? "",
  })
}

/**
 * POST: Update GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in .env.local.
 * Preserves all other env vars; backs up the existing file before writing.
 */
export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { githubToken?: string; githubRepoOwner?: string; githubRepoName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const rawToken = typeof body.githubToken === "string" ? body.githubToken : ""
  const repoOwner = typeof body.githubRepoOwner === "string" ? body.githubRepoOwner.trim() : ""
  const repoName = typeof body.githubRepoName === "string" ? body.githubRepoName.trim() : ""

  // Empty-string token means "leave existing value unchanged"
  const nextToken = rawToken.trim() === "" ? null : rawToken.trim()

  const projectDir = process.cwd()
  const envPath = path.join(projectDir, ".env.local")

  let existing = ""
  try {
    existing = await readFile(envPath, "utf-8")
  } catch {
    // .env.local doesn't exist yet — we'll create it
  }

  // Backup existing file
  try {
    await access(envPath)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    await copyFile(envPath, path.join(projectDir, `.env.local-backup-${timestamp}`))
  } catch {
    // No existing file to back up
  }

  const updates: Record<string, string | null> = {
    GITHUB_REPO_OWNER: repoOwner === "" ? null : repoOwner,
    GITHUB_REPO_NAME: repoName === "" ? null : repoName,
  }
  if (nextToken !== null) {
    updates.GITHUB_TOKEN = nextToken
  }

  const updated = upsertEnvVars(existing, updates)
  await writeFile(envPath, updated, "utf-8")

  // Update current process so the values take effect immediately (without a restart).
  if (nextToken !== null) {
    process.env.GITHUB_TOKEN = nextToken
  }
  if (repoOwner === "") {
    delete process.env.GITHUB_REPO_OWNER
  } else {
    process.env.GITHUB_REPO_OWNER = repoOwner
  }
  if (repoName === "") {
    delete process.env.GITHUB_REPO_NAME
  } else {
    process.env.GITHUB_REPO_NAME = repoName
  }

  return NextResponse.json({ success: true })
}

