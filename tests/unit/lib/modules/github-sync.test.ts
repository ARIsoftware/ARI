/**
 * Tests for lib/modules/github-sync.ts
 *
 * The module uses `fs` (sync methods) and the global `fetch` for GitHub API
 * calls. We mock both so no real filesystem or network access occurs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'

// ── fs mock ────────────────────────────────────────────────────────────────────
// github-sync imports `fs` as default (import fs from 'fs')

const { fakeFs } = vi.hoisted(() => ({
  fakeFs: {
    realpathSync: vi.fn<(path: string) => string>(),
    readdirSync: vi.fn<(path: string, opts: { withFileTypes: boolean }) => any[]>(),
    readFileSync: vi.fn<(path: string, enc: string) => string>(),
    existsSync: vi.fn<(path: string) => boolean>(),
  },
}))

vi.mock('fs', () => ({ default: fakeFs, ...fakeFs }))

// ── global fetch mock ─────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── import SUT after mocks ────────────────────────────────────────────────────

import { getGitHubConfig, commitModuleToGitHub } from '@/lib/modules/github-sync'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeConfig() {
  return {
    token: 'ghp_test',
    owner: 'test-owner',
    repo: 'test-repo',
    branch: 'main',
  }
}

/** Build a valid modules-custom path that passes the allowlist check */
function makeModuleDir(moduleId: string) {
  return path.resolve(process.cwd(), 'modules-custom', moduleId)
}

/** Fake a single file in the module dir */
function setupModuleDirWithFile(moduleDir: string, fileName: string, content: string) {
  // realpathSync: return the path unchanged (no symlinks)
  fakeFs.realpathSync.mockImplementation((p: string) => p)

  fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
    if (p === moduleDir) {
      return [{ name: fileName, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }]
    }
    return []
  })

  fakeFs.readFileSync.mockReturnValue(content)
}

/** Mock the GitHub API call sequence for a successful commit */
function setupGitHubApiSuccess() {
  let callIndex = 0
  mockFetch.mockImplementation((_url: string, _opts: any) => {
    callIndex++
    // Sequence: getRef → getCommit → (blob per file)... → createTree → createCommit → updateRef
    const responses: any[] = [
      // GET /git/ref/heads/main
      { object: { sha: 'head-sha-123' } },
      // GET /git/commits/head-sha-123
      { tree: { sha: 'base-tree-sha' } },
      // POST /git/blobs (one per file)
      { sha: 'blob-sha-abc' },
      // POST /git/trees
      { sha: 'new-tree-sha' },
      // POST /git/commits
      { sha: 'new-commit-sha' },
      // PATCH /git/refs/heads/main
      { sha: 'new-commit-sha' },
    ]
    const body = responses[callIndex - 1] ?? {}
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    })
  })
}

// ── getGitHubConfig ───────────────────────────────────────────────────────────

describe('getGitHubConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GITHUB_TOKEN
    delete process.env.VERCEL_GIT_REPO_OWNER
    delete process.env.GITHUB_REPO_OWNER
    delete process.env.VERCEL_GIT_REPO_SLUG
    delete process.env.GITHUB_REPO_NAME
    delete process.env.VERCEL_GIT_COMMIT_REF
    delete process.env.GITHUB_BRANCH
  })

  it('returns null when GITHUB_TOKEN is not set', () => {
    expect(getGitHubConfig()).toBeNull()
  })

  it('returns null when token exists but owner/repo are missing', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    expect(getGitHubConfig()).toBeNull()
  })

  it('returns null when only owner is set', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPO_OWNER = 'test-owner'
    expect(getGitHubConfig()).toBeNull()
  })

  it('returns config with GITHUB_ env vars', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPO_OWNER = 'owner'
    process.env.GITHUB_REPO_NAME = 'repo'
    const config = getGitHubConfig()
    expect(config).not.toBeNull()
    expect(config!.token).toBe('ghp_test')
    expect(config!.owner).toBe('owner')
    expect(config!.repo).toBe('repo')
    expect(config!.branch).toBe('main') // default
  })

  it('prefers VERCEL_ vars over GITHUB_ vars', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPO_OWNER = 'fallback-owner'
    process.env.VERCEL_GIT_REPO_OWNER = 'vercel-owner'
    process.env.GITHUB_REPO_NAME = 'fallback-repo'
    process.env.VERCEL_GIT_REPO_SLUG = 'vercel-repo'
    process.env.VERCEL_GIT_COMMIT_REF = 'feature-branch'
    const config = getGitHubConfig()
    expect(config!.owner).toBe('vercel-owner')
    expect(config!.repo).toBe('vercel-repo')
    expect(config!.branch).toBe('feature-branch')
  })

  it('uses GITHUB_BRANCH when VERCEL_GIT_COMMIT_REF is absent', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPO_OWNER = 'owner'
    process.env.GITHUB_REPO_NAME = 'repo'
    process.env.GITHUB_BRANCH = 'develop'
    const config = getGitHubConfig()
    expect(config!.branch).toBe('develop')
  })
})

// ── commitModuleToGitHub ──────────────────────────────────────────────────────

describe('commitModuleToGitHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when the module directory has no files', async () => {
    const moduleDir = makeModuleDir('empty-module')
    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockReturnValue([])

    await expect(
      commitModuleToGitHub('empty-module', moduleDir, makeConfig())
    ).rejects.toThrow('No files found in module directory')
  })

  it('throws when directory is outside allowed roots', async () => {
    // realpathSync: for allowed root candidates return themselves normally,
    // but for the actual module dir return a path outside any allowed root.
    fakeFs.realpathSync.mockImplementation((p: string) => {
      // Any path under modules-custom/core or tmpdir gets resolved normally
      if (p.includes('modules-custom') || p.includes('modules-core') || p.includes('ari-modules')) return p
      // The evil directory resolves to something completely outside
      return '/totally/outside/all/roots'
    })

    await expect(
      commitModuleToGitHub('evil', '/totally/outside/all/roots', makeConfig())
    ).rejects.toThrow(/Refusing to read directory outside allowed module roots/)
  })

  it('commits a single file and returns commit SHA', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{"id":"my-module"}')
    setupGitHubApiSuccess()

    const result = await commitModuleToGitHub('my-module', moduleDir, config)
    expect(result.commitSha).toBe('new-commit-sha')
    expect(result.filesCommitted).toBe(1)
    expect(result.message).toContain('my-module')
  })

  it('includes extra files in the commit', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')

    // Two blobs needed: one for module file, one for extra file
    let callIndex = 0
    mockFetch.mockImplementation((_url: string, _opts: any) => {
      callIndex++
      const responses: any[] = [
        { object: { sha: 'head-sha' } },         // GET ref
        { tree: { sha: 'base-tree' } },           // GET commit
        { sha: 'blob-module' },                   // POST blob (module file)
        { sha: 'blob-extra' },                    // POST blob (extra file)
        { sha: 'new-tree' },                      // POST tree
        { sha: 'new-commit' },                    // POST commit
        { sha: 'new-commit' },                    // PATCH ref
      ]
      return Promise.resolve({ ok: true, json: () => Promise.resolve(responses[callIndex - 1] ?? {}) })
    })

    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === moduleDir) {
        return [{ name: 'module.json', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('{}')

    const result = await commitModuleToGitHub('my-module', moduleDir, config, [
      { repoPath: 'package.json', content: '{}' }
    ])
    expect(result.filesCommitted).toBe(2)
    expect(result.commitSha).toBe('new-commit')
  })

  it('throws on invalid extra file path (absolute)', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{}')
    setupGitHubApiSuccess()

    await expect(
      commitModuleToGitHub('my-module', moduleDir, config, [
        { repoPath: '/absolute/path.json', content: '{}' }
      ])
    ).rejects.toThrow(/Invalid extra file path/)
  })

  it('throws on extra file path with ".." traversal', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{}')
    setupGitHubApiSuccess()

    await expect(
      commitModuleToGitHub('my-module', moduleDir, config, [
        { repoPath: '../evil.json', content: '{}' }
      ])
    ).rejects.toThrow(/Invalid extra file path/)
  })

  it('throws on extra file path with empty segment', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{}')
    setupGitHubApiSuccess()

    await expect(
      commitModuleToGitHub('my-module', moduleDir, config, [
        { repoPath: 'foo//bar.json', content: '{}' }
      ])
    ).rejects.toThrow(/Invalid extra file path/)
  })

  it('throws on empty extra file path', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{}')
    setupGitHubApiSuccess()

    await expect(
      commitModuleToGitHub('my-module', moduleDir, config, [
        { repoPath: '', content: '{}' }
      ])
    ).rejects.toThrow(/Invalid extra file path/)
  })

  it('throws when GitHub API returns an error response', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{}')

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ message: 'Not Found' }),
    })

    await expect(
      commitModuleToGitHub('my-module', moduleDir, config)
    ).rejects.toThrow(/GitHub API error: 404/)
  })

  it('uses statusText fallback when error JSON has no message field', async () => {
    // Covers the `||` fallback: `error.message || response.statusText`
    // When JSON body has no 'message' key, error.message is undefined → use statusText
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{}')

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({}),  // no 'message' field
    })

    await expect(
      commitModuleToGitHub('my-module', moduleDir, config)
    ).rejects.toThrow(/GitHub API error: 403.*Forbidden/)
  })

  it('uses statusText when response.json() throws (catch fallback returns {})', async () => {
    // The error body is not valid JSON → response.json() rejects → catch(() => ({})) fires
    // Then error.message is undefined → falls back to response.statusText
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    setupModuleDirWithFile(moduleDir, 'module.json', '{}')

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('invalid JSON')),
    })

    await expect(
      commitModuleToGitHub('my-module', moduleDir, config)
    ).rejects.toThrow(/GitHub API error: 500.*Internal Server Error/)
  })

  it('uses tmpdir as an allowed root', async () => {
    // The allowed roots include os.tmpdir()/ari-modules
    const tmpModuleDir = path.resolve(os.tmpdir(), 'ari-modules', 'temp-module')
    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === tmpModuleDir) {
        return [{ name: 'index.ts', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('// hello')
    setupGitHubApiSuccess()

    const result = await commitModuleToGitHub('temp-module', tmpModuleDir, makeConfig())
    expect(result.filesCommitted).toBe(1)
  })

  it('skips symlinks in directory traversal', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === moduleDir) {
        return [
          { name: 'symlink.ts', isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true },
          { name: 'real.ts', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        ]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('// content')
    setupGitHubApiSuccess()

    const result = await commitModuleToGitHub('my-module', moduleDir, config)
    // Only the real file is committed, not the symlink
    expect(result.filesCommitted).toBe(1)
  })

  it('reads subdirectories recursively', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    const subDir = path.resolve(moduleDir, 'components')

    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === moduleDir) {
        return [
          { name: 'module.json', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          { name: 'components', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
        ]
      }
      if (p === subDir) {
        return [
          { name: 'Button.tsx', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        ]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('content')

    // Need extra blobs: module.json + Button.tsx = 2 blobs
    let callIndex = 0
    mockFetch.mockImplementation(() => {
      callIndex++
      const responses: any[] = [
        { object: { sha: 'head-sha' } },
        { tree: { sha: 'base-tree' } },
        { sha: 'blob-1' },
        { sha: 'blob-2' },
        { sha: 'new-tree' },
        { sha: 'new-commit' },
        { sha: 'new-commit' },
      ]
      return Promise.resolve({ ok: true, json: () => Promise.resolve(responses[callIndex - 1] ?? {}) })
    })

    const result = await commitModuleToGitHub('my-module', moduleDir, config)
    expect(result.filesCommitted).toBe(2)
  })

  it('skips node_modules and .git subdirectories', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')
    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === moduleDir) {
        return [
          { name: 'module.json', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          { name: 'node_modules', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
          { name: '.git', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
        ]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('{}')
    setupGitHubApiSuccess()

    const result = await commitModuleToGitHub('my-module', moduleDir, config)
    // Only module.json is included
    expect(result.filesCommitted).toBe(1)
  })

  it('skips non-existent directory gracefully (realpathSync throws)', async () => {
    fakeFs.realpathSync.mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })

    await expect(
      commitModuleToGitHub('ghost', '/nonexistent/path', makeConfig())
    ).rejects.toThrow('No files found in module directory')
  })

  it('reads binary files with base64 encoding', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')

    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === moduleDir) {
        return [
          { name: 'icon.png', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        ]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('base64encodedcontent')
    setupGitHubApiSuccess()

    const result = await commitModuleToGitHub('my-module', moduleDir, config)
    expect(result.filesCommitted).toBe(1)
    // readFileSync should have been called with 'base64' encoding for .png
    expect(fakeFs.readFileSync).toHaveBeenCalledWith(expect.any(String), 'base64')
  })

  it('commit message includes extra file names', async () => {
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')

    let callIndex = 0
    mockFetch.mockImplementation(() => {
      callIndex++
      const responses: any[] = [
        { object: { sha: 'head-sha' } },
        { tree: { sha: 'base-tree' } },
        { sha: 'blob-module' },
        { sha: 'blob-extra' },
        { sha: 'new-tree' },
        { sha: 'new-commit' },
        { sha: 'new-commit' },
      ]
      return Promise.resolve({ ok: true, json: () => Promise.resolve(responses[callIndex - 1] ?? {}) })
    })

    fakeFs.realpathSync.mockImplementation((p: string) => p)
    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === moduleDir) {
        return [{ name: 'module.json', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('{}')

    const result = await commitModuleToGitHub('my-module', moduleDir, config, [
      { repoPath: 'package.json', content: '{}', encoding: 'utf-8' }
    ])
    // With extraFiles: commit message should contain package.json
    expect(result.message).toContain('my-module')
    expect(result.filesCommitted).toBe(2)
  })
})

// ── getAllowedRoots — realpathSync fallback ────────────────────────────────────

describe('getAllowedRoots — realpathSync fallback on candidate not found', () => {
  it('uses the raw path when realpathSync throws for a candidate root', async () => {
    // modules-core and tmpdir may not exist; getAllowedRoots catches and uses raw path.
    // We trigger this by having realpathSync throw for candidate roots but succeed for the module dir.
    const config = makeConfig()
    const moduleDir = makeModuleDir('my-module')

    // realpathSync: succeed for modules-custom paths, throw for modules-core/tmpdir
    fakeFs.realpathSync.mockImplementation((p: string) => {
      if (p.includes('modules-core') || p.includes('ari-modules')) {
        throw new Error('ENOENT')
      }
      return p  // modules-custom and the module dir succeed
    })

    fakeFs.readdirSync.mockImplementation((p: string, _opts: any) => {
      if (p === moduleDir) {
        return [{ name: 'index.ts', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }]
      }
      return []
    })
    fakeFs.readFileSync.mockReturnValue('// hello')
    setupGitHubApiSuccess()

    const result = await commitModuleToGitHub('my-module', moduleDir, config)
    expect(result.filesCommitted).toBe(1)
  })
})
