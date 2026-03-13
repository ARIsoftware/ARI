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

/** Get current HEAD SHA and base tree SHA for a branch. */
async function getHeadAndTree(config: GitHubConfig) {
  const ref = await githubApi(`/git/ref/heads/${config.branch}`, config)
  const currentSha = ref.object.sha
  const currentCommit = await githubApi(`/git/commits/${currentSha}`, config)
  return { currentSha, baseTreeSha: currentCommit.tree.sha }
}

/** Create a new tree, commit it, and update the branch ref. Returns the new commit SHA. */
async function commitTree(
  config: GitHubConfig,
  baseTreeSha: string,
  treeEntries: any[],
  parentSha: string,
  message: string
): Promise<string> {
  const newTree = await githubApi('/git/trees', config, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  })
  const newCommit = await githubApi('/git/commits', config, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
  })
  await githubApi(`/git/refs/heads/${config.branch}`, config, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newCommit.sha }),
  })
  return newCommit.sha
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
  const { currentSha, baseTreeSha } = await getHeadAndTree(config)

  // Create blobs for each file
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

  const commitSha = await commitTree(config, baseTreeSha, treeEntries, currentSha, `Add module: ${moduleId}`)

  return {
    commitSha,
    filesCommitted: files.length,
    message: `Module "${moduleId}" committed to ${config.owner}/${config.repo}@${config.branch}`,
  }
}

/**
 * Delete a module's files from GitHub by creating a commit that removes them.
 * Uses the Git Trees API with `sha: null` entries to mark files for deletion.
 */
export async function deleteModuleFromGitHub(
  moduleId: string,
  config: GitHubConfig
): Promise<{ commitSha: string; filesDeleted: number; message: string }> {
  const commitPath = `modules-core/${moduleId}/`
  const { currentSha, baseTreeSha } = await getHeadAndTree(config)

  // Fetch full repo tree to find module files
  const fullTree = await githubApi(`/git/trees/${baseTreeSha}?recursive=1`, config)
  const moduleFiles = fullTree.tree.filter(
    (entry: { path: string; type: string }) =>
      entry.path.startsWith(commitPath) && entry.type === 'blob'
  )

  if (moduleFiles.length === 0) {
    throw new Error(`No files found for module "${moduleId}" in GitHub`)
  }

  // Create tree entries with sha: null to delete each file
  const treeEntries = moduleFiles.map((file: { path: string }) => ({
    path: file.path,
    mode: '100644' as const,
    type: 'blob' as const,
    sha: null,
  }))

  const commitSha = await commitTree(config, baseTreeSha, treeEntries, currentSha, `Remove module: ${moduleId}`)

  return {
    commitSha,
    filesDeleted: moduleFiles.length,
    message: `Module "${moduleId}" removed from ${config.owner}/${config.repo}@${config.branch}`,
  }
}
