import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { getGitHubConfig, commitModuleToGitHub } from '@/lib/modules/github-sync'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { requirePermission } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'
import {
  githubSyncSchema,
  GithubSyncResponseSchema,
  GithubSyncStatusSchema,
} from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

registry.registerPath({
  method: 'get',
  path: '/api/modules/github-sync',
  operationId: 'getModulesGithubSyncStatus',
  summary: 'Current GitHub sync configuration (no token returned)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'GitHub sync config', content: { 'application/json': { schema: GithubSyncStatusSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/github-sync',
  operationId: 'commitModuleToGithub',
  summary: 'Commit a module directory to the configured GitHub repository (Vercel deploys require this)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: githubSyncSchema } } } },
  responses: {
    200: { description: 'Commit successful', content: { 'application/json': { schema: GithubSyncResponseSchema } } },
    400: { description: 'GitHub not configured or invalid directory', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Sync failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

async function handlePOST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Commits module code to the configured GitHub repo — module managers only.
  const denied = requirePermission(user, 'manage_modules', 'You do not have permission to manage modules')
  if (denied) return denied

  const config = getGitHubConfig()
  if (!config) {
    return NextResponse.json(
      { error: 'GitHub not configured. Set GITHUB_TOKEN, and either VERCEL_GIT_REPO_OWNER/VERCEL_GIT_REPO_SLUG or GITHUB_REPO_OWNER/GITHUB_REPO_NAME.' },
      { status: 400 }
    )
  }

  try {
    const { moduleId, moduleDir } = await request.json()
    if (!moduleId || !moduleDir) {
      return NextResponse.json({ error: 'moduleId and moduleDir are required' }, { status: 400 })
    }

    // Validate moduleDir is within expected directories
    const resolvedDir = path.resolve(moduleDir)
    const cwd = process.cwd()
    const isVercel = !!process.env.VERCEL
    const isInModulesDir = resolvedDir.startsWith(path.join(cwd, 'modules-core')) || resolvedDir.startsWith(path.join(cwd, 'modules-custom'))
    const isInTmp = isVercel && resolvedDir.startsWith('/tmp/ari-modules/')

    if (!isInModulesDir && !isInTmp) {
      return NextResponse.json({ error: 'Invalid module directory' }, { status: 400 })
    }

    const result = await commitModuleToGitHub(moduleId, resolvedDir, config)

    return NextResponse.json({
      success: true,
      message: result.message,
      commitSha: result.commitSha,
      filesCommitted: result.filesCommitted,
    })
  } catch (error: unknown) {
    logger.error('[GitHub Sync] Error:', error)
    return NextResponse.json(
      { error: safeErrorResponse(error) },
      { status: 500 }
    )
  }
}

async function handleGET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = getGitHubConfig()
  const isVercel = !!process.env.VERCEL
  return NextResponse.json({
    configured: !!config,
    isVercel,
    ...(config ? {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
    } : {
      hint: 'Set GITHUB_TOKEN and GITHUB_REPO_OWNER/GITHUB_REPO_NAME environment variables',
    }),
  })
}

export const GET = withApiLogging(handleGET)
export const POST = withApiLogging(handlePOST)
