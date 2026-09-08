import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile, copyFile, access } from "fs/promises"
import path from "path"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { requireAdmin } from "@/lib/api-helpers"
import { upsertEnvVars } from "@/lib/env-file"
import {
  SettingsGithubStatusSchema,
  settingsGithubBodySchema,
  SuccessSchema,
} from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { DEFAULT_SECURITY, ErrorResponseSchema } from "@/lib/openapi/common"
import { withApiLogging } from '@/lib/api-logging'
import { isVercel } from "@/lib/deployment"

registry.registerPath({
  method: 'get',
  path: '/api/settings/github',
  operationId: 'getGithubSettings',
  summary: 'Current GitHub Sync configuration (token presence only, not the value)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'GitHub settings', content: { 'application/json': { schema: SettingsGithubStatusSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/settings/github',
  operationId: 'updateGithubSettings',
  summary: 'Update GitHub Sync configuration in .env.local (token + owner + repo)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: settingsGithubBodySchema } } } },
  responses: {
    200: { description: 'Settings saved', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Invalid JSON body', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

/**
 * GET: Return current GitHub Sync configuration (owner + repo name + whether a token is set).
 * Reads directly from .env.local so the UI reflects the file's true state — process.env
 * can drift from disk if the file is edited externally or Next.js doesn't re-load env on HMR.
 * The token itself is never returned for security.
 */
async function handleGET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // GitHub sync config lives in .env.local (system-wide) — admin only.
  const denied = requireAdmin(user, "Admin access required")
  if (denied) return denied

  // On Vercel there is no .env.local — config lives in the project's env vars.
  if (isVercel()) {
    return NextResponse.json({
      hasToken: !!process.env.GITHUB_TOKEN,
      repoOwner: process.env.VERCEL_GIT_REPO_OWNER || process.env.GITHUB_REPO_OWNER || "",
      repoName: process.env.VERCEL_GIT_REPO_SLUG || process.env.GITHUB_REPO_NAME || "",
    })
  }

  const envPath = path.join(process.cwd(), ".env.local")
  let envContent = ""
  try {
    envContent = await readFile(envPath, "utf-8")
  } catch {
    // .env.local doesn't exist yet
  }

  const fileVars = parseEnvFile(envContent)

  return NextResponse.json({
    hasToken: !!fileVars.GITHUB_TOKEN,
    repoOwner: fileVars.GITHUB_REPO_OWNER ?? "",
    repoName: fileVars.GITHUB_REPO_NAME ?? "",
  })
}

/**
 * Minimal dotenv parser — extracts KEY=VALUE pairs, ignoring comments.
 * Handles double-quoted values with escape sequences, mirroring `formatEnvValue`.
 */
function parseEnvFile(source: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith("#")) continue
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    let value = rawValue.trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    }
    if (value !== "") result[key] = value
  }
  return result
}

/**
 * POST: Update GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in .env.local.
 * Preserves all other env vars; backs up the existing file before writing.
 */
async function handlePOST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Writes GITHUB_TOKEN and repo config to .env.local (system-wide) — admin only.
  const denied = requireAdmin(user, "Admin access required")
  if (denied) return denied

  // Vercel's filesystem is read-only — the token must be set as a project
  // env var in the dashboard (owner/repo/branch come from VERCEL_GIT_* free).
  if (isVercel()) {
    return NextResponse.json(
      {
        error:
          "On Vercel, set GITHUB_TOKEN in your Vercel project's Settings → Environment Variables and redeploy. Repository owner and name are detected automatically from the linked Git repository.",
      },
      { status: 400 }
    )
  }

  let body: {
    githubToken?: string
    githubRepoOwner?: string
    githubRepoName?: string
    clearToken?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const rawToken = typeof body.githubToken === "string" ? body.githubToken : ""
  const repoOwner = typeof body.githubRepoOwner === "string" ? body.githubRepoOwner.trim() : ""
  const repoName = typeof body.githubRepoName === "string" ? body.githubRepoName.trim() : ""
  const clearToken = body.clearToken === true

  // lib/env-file.ts contract: callers MUST pre-reject values containing
  // \r, \n, or \x00 — formatEnvValue escapes quotes but not newlines, and
  // line-oriented .env consumers (the ari CLI, --env-file loaders) would
  // otherwise ingest an injected extra line as a real variable.
  const envUnsafe = /[\x00\r\n]/
  if (envUnsafe.test(rawToken) || envUnsafe.test(repoOwner) || envUnsafe.test(repoName)) {
    return NextResponse.json(
      { error: "Values must not contain newlines or control characters" },
      { status: 400 }
    )
  }

  // Token semantics:
  //   - clearToken=true → explicitly remove the token from .env.local
  //   - non-empty string → set/replace the token
  //   - empty string (without clearToken) → leave existing value unchanged
  const trimmedToken = rawToken.trim()
  const nextToken: string | null | "CLEAR" =
    clearToken && trimmedToken === "" ? "CLEAR" : trimmedToken === "" ? null : trimmedToken

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
  if (nextToken === "CLEAR") {
    updates.GITHUB_TOKEN = null
  } else if (nextToken !== null) {
    updates.GITHUB_TOKEN = nextToken
  }

  const updated = upsertEnvVars(existing, updates)
  await writeFile(envPath, updated, { encoding: "utf-8", mode: 0o600 })

  // Update current process so the values take effect immediately (without a restart).
  if (nextToken === "CLEAR") {
    delete process.env.GITHUB_TOKEN
  } else if (nextToken !== null) {
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


export const GET = withApiLogging(handleGET)
export const POST = withApiLogging(handlePOST)
