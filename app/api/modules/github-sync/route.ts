import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null

  // Try Vercel env vars first, then fall back to defaults
  const owner = process.env.VERCEL_GIT_REPO_OWNER || process.env.GITHUB_REPO_OWNER
  const repo = process.env.VERCEL_GIT_REPO_SLUG || process.env.GITHUB_REPO_NAME
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_BRANCH || 'main'

  if (!owner || !repo) return null

  return { token, owner, repo, branch }
}

async function githubApi(endpoint: string, config: { token: string; owner: string; repo: string }, options: RequestInit = {}) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`GitHub API error: ${response.status} - ${error.message || response.statusText}`)
  }
  return response.json()
}

const BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|ico|webp|bmp|avif|woff|woff2|ttf|otf|eot|pdf|zip|tar|gz|mp3|mp4|wav)$/i

/**
 * Recursively collect all files in a directory
 */
function collectFiles(dir: string, basePath: string = ''): { path: string; content: string; encoding: 'utf-8' | 'base64' }[] {
  const files: { path: string; content: string; encoding: 'utf-8' | 'base64' }[] = []
  if (!fs.existsSync(dir)) return files

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      // Skip node_modules and .git
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      files.push(...collectFiles(fullPath, relativePath))
    } else {
      const isBinary = BINARY_EXTENSIONS.test(entry.name)
      const encoding = isBinary ? 'base64' : 'utf-8'
      files.push({ path: relativePath, content: fs.readFileSync(fullPath, encoding), encoding })
    }
  }
  return files
}

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

    // Collect all module files
    const files = collectFiles(resolvedDir)
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files found in module directory' }, { status: 400 })
    }

    // Get the relative path from project root for the commit
    // On Vercel with /tmp paths, map to modules-core/<moduleId>
    const relativeModuleDir = isInTmp
      ? `modules-core/${moduleId}`
      : path.relative(cwd, resolvedDir)

    // Step 1: Get current HEAD
    const ref = await githubApi(`/git/ref/heads/${config.branch}`, config)
    const currentSha = ref.object.sha

    // Step 2: Get the current commit to find the base tree
    const currentCommit = await githubApi(`/git/commits/${currentSha}`, config)
    const baseTreeSha = currentCommit.tree.sha

    // Step 3: Create blobs for each file
    const treeEntries = await Promise.all(
      files.map(async (file) => {
        const blob = await githubApi('/git/blobs', config, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: file.content, encoding: file.encoding }),
        })
        return {
          path: `${relativeModuleDir}/${file.path}`,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        }
      })
    )

    // Step 4: Create new tree
    const newTree = await githubApi('/git/trees', config, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    })

    // Step 5: Create commit
    const newCommit = await githubApi('/git/commits', config, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Add module: ${moduleId}`,
        tree: newTree.sha,
        parents: [currentSha],
      }),
    })

    // Step 6: Update branch ref
    await githubApi(`/git/refs/heads/${config.branch}`, config, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommit.sha }),
    })

    return NextResponse.json({
      success: true,
      message: `Module "${moduleId}" committed to ${config.owner}/${config.repo}@${config.branch}`,
      commitSha: newCommit.sha,
      filesCommitted: files.length,
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
  return NextResponse.json({
    configured: !!config,
    ...(config ? {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
    } : {
      hint: 'Set GITHUB_TOKEN and GITHUB_REPO_OWNER/GITHUB_REPO_NAME environment variables',
    }),
  })
}
