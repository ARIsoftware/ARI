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

type GitHubConfig = NonNullable<ReturnType<typeof getGitHubConfig>>

async function githubApi(endpoint: string, config: GitHubConfig, options: RequestInit = {}) {
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

function collectFiles(dir: string, basePath: string = ''): { path: string; content: string; encoding: 'utf-8' | 'base64' }[] {
  const files: { path: string; content: string; encoding: 'utf-8' | 'base64' }[] = []
  if (!fs.existsSync(dir)) return files
  // realpathSync resolves symlinks once at the root so the iteration anchor
  // is a real on-disk directory; combined with the per-entry symlink skip
  // below this prevents a symlink inside a module from exfiltrating files
  // outside the module tree when the result is committed to GitHub.
  const resolvedDir = fs.realpathSync(path.resolve(dir))

  for (const entry of fs.readdirSync(resolvedDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue

    const fullPath = path.resolve(resolvedDir, entry.name)
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

    // Defense-in-depth: readdir shouldn't return ../ but verify containment anyway
    if (!fullPath.startsWith(resolvedDir + path.sep) && fullPath !== resolvedDir) {
      continue
    }

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      files.push(...collectFiles(fullPath, relativePath))
    } else if (entry.isFile()) {
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
 * Extra file payload committed alongside the module directory. Used by the
 * download flow to ship a mutated root `package.json` (when a module's
 * npmDependencies are merged in) in the same atomic commit as the module
 * files. `repoPath` is repo-root-relative — no `modules-core/` prefix.
 */
export type ExtraCommitFile = {
  repoPath: string
  content: string
  encoding?: 'utf-8' | 'base64'
}

/**
 * Commit module files to GitHub.
 * @param moduleId - The module identifier (e.g., "baseball")
 * @param sourceDir - The local directory containing the module files
 * @param config - GitHub configuration
 * @param extraFiles - Optional repo-root-relative files to include in the
 *                    same commit (e.g. an updated `package.json`).
 * @returns Commit result with sha and file count (module files + extras)
 */
export async function commitModuleToGitHub(
  moduleId: string,
  sourceDir: string,
  config: GitHubConfig,
  extraFiles: ExtraCommitFile[] = []
): Promise<{ commitSha: string; filesCommitted: number; message: string }> {
  const files = collectFiles(sourceDir)
  if (files.length === 0) {
    throw new Error('No files found in module directory')
  }

  const commitPath = `modules-core/${moduleId}`
  const { currentSha, baseTreeSha } = await getHeadAndTree(config)

  // Defense-in-depth: extra files must be repo-root-relative and must not
  // climb out of the repo or alias to the module directory.
  for (const extra of extraFiles) {
    if (
      typeof extra.repoPath !== 'string' ||
      extra.repoPath.length === 0 ||
      extra.repoPath.startsWith('/') ||
      extra.repoPath.split('/').some((seg) => seg === '..' || seg === '')
    ) {
      throw new Error(`Invalid extra file path: ${extra.repoPath}`)
    }
  }

  const moduleEntries = await Promise.all(
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

  const extraEntries = await Promise.all(
    extraFiles.map(async (file) => {
      const blob = await githubApi('/git/blobs', config, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: file.content, encoding: file.encoding ?? 'utf-8' }),
      })
      return {
        path: file.repoPath,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha,
      }
    })
  )

  const treeEntries = [...moduleEntries, ...extraEntries]
  const commitMessage =
    extraFiles.length > 0
      ? `Add module: ${moduleId} (+ ${extraFiles.map((f) => f.repoPath).join(', ')})`
      : `Add module: ${moduleId}`

  const commitSha = await commitTree(config, baseTreeSha, treeEntries, currentSha, commitMessage)

  return {
    commitSha,
    filesCommitted: files.length + extraFiles.length,
    message: `Module "${moduleId}" committed to ${config.owner}/${config.repo}@${config.branch}`,
  }
}
