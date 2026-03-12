import fs from 'fs'
import path from 'path'

export function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null

  const owner = process.env.VERCEL_GIT_REPO_OWNER || process.env.GITHUB_REPO_OWNER
  const repo = process.env.VERCEL_GIT_REPO_SLUG || process.env.GITHUB_REPO_NAME
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_BRANCH || 'main'

  if (!owner || !repo) return null

  return { token, owner, repo, branch }
}

export type GitHubConfig = NonNullable<ReturnType<typeof getGitHubConfig>>

export async function githubApi(endpoint: string, config: GitHubConfig, options: RequestInit = {}) {
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

export function collectFiles(dir: string, basePath: string = ''): { path: string; content: string; encoding: 'utf-8' | 'base64' }[] {
  const files: { path: string; content: string; encoding: 'utf-8' | 'base64' }[] = []
  if (!fs.existsSync(dir)) return files

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
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

/**
 * Commit module files to GitHub.
 * @param moduleId - The module identifier (e.g., "baseball")
 * @param sourceDir - The local directory containing the module files
 * @param config - GitHub configuration
 * @returns Commit result with sha and file count
 */
export async function commitModuleToGitHub(
  moduleId: string,
  sourceDir: string,
  config: GitHubConfig
): Promise<{ commitSha: string; filesCommitted: number; message: string }> {
  const files = collectFiles(sourceDir)
  if (files.length === 0) {
    throw new Error('No files found in module directory')
  }

  const commitPath = `modules-core/${moduleId}`

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
        path: `${commitPath}/${file.path}`,
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

  return {
    commitSha: newCommit.sha,
    filesCommitted: files.length,
    message: `Module "${moduleId}" committed to ${config.owner}/${config.repo}@${config.branch}`,
  }
}
