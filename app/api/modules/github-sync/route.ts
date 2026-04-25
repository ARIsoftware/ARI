import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { getGitHubConfig, commitModuleToGitHub } from '@/lib/modules/github-sync'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

export async function GET() {
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
