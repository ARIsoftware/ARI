import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import path from 'path'
import { getGitHubConfig, commitModuleToGitHub } from '@/lib/modules/github-sync'

export async function POST(request: NextRequest) {
  // Auth check
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('better-auth.session_token')
    || cookieStore.get('__Secure-better-auth.session_token')
  if (!sessionCookie) {
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
  } catch (error: any) {
    console.error('[GitHub Sync] Error:', error)
    return NextResponse.json(
      { error: 'Failed to sync to GitHub', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET: Check GitHub configuration status
 */
export async function GET() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('better-auth.session_token')
    || cookieStore.get('__Secure-better-auth.session_token')
  if (!sessionCookie) {
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
