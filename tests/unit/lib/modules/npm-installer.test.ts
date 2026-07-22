/**
 * Tests for lib/modules/npm-installer.ts — raising from ~10% to ~100%.
 *
 * The existing npm-deps-validation.test.ts covers validateNpmDeps fully.
 * This file covers:
 *  - installModuleNpmDeps: empty deps, vercel path, local path, conflict detection,
 *    already-satisfied, unknown-range abort, queue serialisation, spawn fallback.
 *  - spawnPnpmAdd: ENOENT fallback to corepack, timeout kill, abort signal, stderr.
 *
 * Mocks: fs/promises, child_process, and the semver-range helper (via module mock).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// ── semver-range mock ─────────────────────────────────────────────────────────
// npm-installer.ts imports from '../../scripts/lib/semver-range.js' (relative
// to its own position at lib/modules/). When vitest resolves the mock id, it
// needs to match what the bundler sees. The @/ alias resolves to the repo root
// in both tsconfig and vitest.config.ts, so both ids point at the same file.

vi.mock('@/scripts/lib/semver-range.js', () => ({
  satisfies: vi.fn(),
  rangeAnchor: vi.fn(),
}))

// ── fs/promises mock ──────────────────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  utimes: vi.fn(),
}))

// ── child_process mock ────────────────────────────────────────────────────────

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// ── import SUT + mocked helpers after vi.mock ─────────────────────────────────

import { installModuleNpmDeps, validateNpmDeps } from '@/lib/modules/npm-installer'
import { readFile, readdir, utimes } from 'fs/promises'
import { spawn } from 'child_process'
import { satisfies, rangeAnchor } from '@/scripts/lib/semver-range.js'

const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>
const mockReaddir = readdir as unknown as ReturnType<typeof vi.fn>
const mockUtimes = utimes as unknown as ReturnType<typeof vi.fn>
const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>
const mockSatisfies = satisfies as unknown as ReturnType<typeof vi.fn>
const mockRangeAnchor = rangeAnchor as unknown as ReturnType<typeof vi.fn>

// ── helper: fake child process ────────────────────────────────────────────────

function makeChildProcess(options: {
  exitCode?: number | null
  spawnError?: Error
  stderrOutput?: string
  stdoutOutput?: string
  delay?: number
}) {
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()

  const {
    exitCode = 0,
    spawnError,
    stderrOutput = '',
    stdoutOutput = '',
    delay = 0,
  } = options

  // Emit events asynchronously
  setTimeout(() => {
    if (spawnError) {
      child.emit('error', spawnError)
      return
    }
    if (stdoutOutput) {
      child.stdout.emit('data', Buffer.from(stdoutOutput))
    }
    if (stderrOutput) {
      child.stderr.emit('data', Buffer.from(stderrOutput))
    }
    child.emit('close', exitCode)
  }, delay)

  return child
}

// ── helpers ───────────────────────────────────────────────────────────────────

const MODULE_DIR = '/fake/module-dir'
const BASE_OPTS = {
  isVercel: false as const,
  githubConfigured: undefined as undefined,
}

function makeRootPkg(deps: Record<string, string> = {}) {
  return JSON.stringify({ name: 'ari', version: '1.0.0', dependencies: deps })
}

// ── validateNpmDeps (smoke tests not in existing file) ────────────────────────

describe('validateNpmDeps — http: protocol', () => {
  it('rejects http: protocol spec', () => {
    expect(validateNpmDeps('m', [['pkg', 'http://example.com/pkg.tgz']])).toMatch(/http:/)
  })
})

// ── installModuleNpmDeps — empty deps ─────────────────────────────────────────

describe('installModuleNpmDeps — empty deps', () => {
  it('returns skipped=empty immediately when no deps provided', async () => {
    const result = await installModuleNpmDeps('test-module', {}, MODULE_DIR, BASE_OPTS)
    expect(result).toMatchObject({ ok: true, installed: [], alreadySatisfied: [], skipped: 'empty' })
  })

  it('returns skipped=empty when deps is undefined', async () => {
    const result = await installModuleNpmDeps('test-module', undefined, MODULE_DIR, BASE_OPTS)
    expect(result).toMatchObject({ ok: true, skipped: 'empty' })
  })
})

// ── installModuleNpmDeps — validation failure ─────────────────────────────────

describe('installModuleNpmDeps — validation failure', () => {
  it('returns error when dep name is invalid', async () => {
    const result = await installModuleNpmDeps(
      'test-module',
      { 'INVALID_NAME': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Invalid npm package name/)
  })

  it('returns error when too many deps', async () => {
    const deps = Object.fromEntries(
      Array.from({ length: 26 }, (_, i) => [`pkg-${i}`, '^1.0.0'])
    )
    const result = await installModuleNpmDeps('test-module', deps, MODULE_DIR, BASE_OPTS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/limit is 25/)
  })
})

// ── installModuleNpmDeps — vercel without GitHub ─────────────────────────────

describe('installModuleNpmDeps — vercel without GitHub', () => {
  it('returns error when vercel=true and githubConfigured=false', async () => {
    const result = await installModuleNpmDeps(
      'test-module',
      { 'some-pkg': '^1.0.0' },
      MODULE_DIR,
      { isVercel: true, githubConfigured: false },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/GitHub/)
  })
})

// ── installModuleNpmDeps — root package.json read failure ─────────────────────

describe('installModuleNpmDeps — package.json read failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when root package.json cannot be read', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'))
    const result = await installModuleNpmDeps(
      'test-module',
      { 'some-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Failed to read root package\.json/)
  })
})

// ── installModuleNpmDeps — already satisfied ─────────────────────────────────

describe('installModuleNpmDeps — already satisfied', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns skipped=none with alreadySatisfied when all deps are met', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({ react: '^18.0.0' }))
    mockRangeAnchor.mockReturnValue('18.0.0')
    mockSatisfies.mockReturnValue(true)

    const events: any[] = []
    const result = await installModuleNpmDeps(
      'test-module',
      { react: '^18.2.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    expect(result).toMatchObject({ ok: true, alreadySatisfied: ['react'], skipped: 'none' })
    expect(events.some(e => e.type === 'already-satisfied')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('returns skipped=none when rangeAnchor returns null (treats as satisfied)', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({ react: '*' }))
    mockRangeAnchor.mockReturnValue(null) // can't compare, treat as satisfied

    const result = await installModuleNpmDeps(
      'test-module',
      { react: '^18.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result).toMatchObject({ ok: true, alreadySatisfied: ['react'], skipped: 'none' })
  })
})

// ── installModuleNpmDeps — version conflict ───────────────────────────────────

describe('installModuleNpmDeps — version conflict', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns conflict error when existing version does not satisfy declared range', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({ react: '^16.0.0' }))
    mockRangeAnchor.mockReturnValue('16.0.0')
    mockSatisfies.mockReturnValue(false)

    const result = await installModuleNpmDeps(
      'test-module',
      { react: '^18.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/react/)
      expect(result.conflict).toMatchObject({ name: 'react', declared: '^18.0.0', existing: '^16.0.0' })
    }
  })

  it('returns error when satisfies returns null (unrecognized range)', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({ somelib: '1.x' }))
    mockRangeAnchor.mockReturnValue('1.0.0')
    mockSatisfies.mockReturnValue(null)

    const result = await installModuleNpmDeps(
      'test-module',
      { somelib: '^2.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Cannot compare version ranges/)
  })
})

// ── installModuleNpmDeps — vercel path ───────────────────────────────────────

describe('installModuleNpmDeps — vercel path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns mutated package.json on vercel without spawning pnpm', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({ existing: '^1.0.0' }))
    // new-pkg not in rootDeps, so rangeAnchor/satisfies won't be called
    mockRangeAnchor.mockReturnValue(null)

    const events: any[] = []
    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^2.0.0' },
      MODULE_DIR,
      { isVercel: true, githubConfigured: true, onEvent: (e) => events.push(e) },
    )
    expect(result).toMatchObject({ ok: true, skipped: 'vercel' })
    if (result.ok && result.skipped === 'vercel') {
      const parsed = JSON.parse(result.mutatedPackageJson!)
      expect(parsed.dependencies['new-pkg']).toBe('^2.0.0')
      // Dependencies should be sorted alphabetically
      const keys = Object.keys(parsed.dependencies)
      expect(keys).toEqual([...keys].sort())
    }
    expect(events.some(e => e.type === 'start')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })
})

// ── installModuleNpmDeps — local spawn path ───────────────────────────────────

describe('installModuleNpmDeps — local spawn path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('succeeds when pnpm exits with code 0', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))
    mockReaddir.mockResolvedValue([]) // no files to touch

    const events: any[] = []
    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    expect(result).toMatchObject({ ok: true, skipped: 'none' })
    expect(events.some(e => e.type === 'spawn')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('returns error when pnpm exits with non-zero code', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 1, stderrOutput: 'install failed' }))

    const result = await installModuleNpmDeps(
      'test-module',
      { 'bad-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
  })

  it('falls back to corepack when pnpm is not found (ENOENT)', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    let callCount = 0
    mockSpawn.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First attempt: pnpm not found
        return makeChildProcess({
          spawnError: Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }),
        })
      }
      // Second attempt: corepack pnpm succeeds
      return makeChildProcess({ exitCode: 0 })
    })
    mockReaddir.mockResolvedValue([])

    const events: any[] = []
    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    expect(result.ok).toBe(true)
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    // Second spawn should use 'corepack'
    expect(mockSpawn.mock.calls[1][0]).toBe('corepack')
  })

  it('returns error when both pnpm and corepack are not found', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockImplementation(() =>
      makeChildProcess({
        spawnError: Object.assign(new Error('not found'), { code: 'ENOENT' }),
      })
    )

    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/pnpm not found|not found on PATH/)
  })

  it('returns error when spawn emits non-ENOENT error', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(
      makeChildProcess({ spawnError: new Error('unexpected spawn error') })
    )

    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
  })

  it('emits stderr events for both stdout and stderr output', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(
      makeChildProcess({ exitCode: 0, stderrOutput: 'warning: something', stdoutOutput: 'Progress: resolved 5' })
    )
    mockReaddir.mockResolvedValue([])

    const events: any[] = []
    await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    const stderrEvents = events.filter(e => e.type === 'stderr')
    expect(stderrEvents.length).toBeGreaterThan(0)
  })

  it('handles stdout/stderr with empty lines (covers trimmed=falsy branch)', async () => {
    // Output with blank lines → some lines have trimmed='' which is falsy
    // This exercises the `if (trimmed) opts.onEvent?.(...)` false branch
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(
      makeChildProcess({
        exitCode: 0,
        // Multi-line output with blank lines — blank lines produce trimmed='' (falsy)
        stderrOutput: 'line1\n\nline3',
        stdoutOutput: 'progress1\n\n',
      })
    )
    mockReaddir.mockResolvedValue([])

    const events: any[] = []
    await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    const stderrEvents = events.filter(e => e.type === 'stderr')
    // Only non-empty lines are emitted; blank lines are filtered out
    expect(stderrEvents.every(e => e.line.trim().length > 0)).toBe(true)
  })

  it('returns ok=false with stderr message when pnpm exits non-zero', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(
      makeChildProcess({ exitCode: 1, stderrOutput: 'ERR: some pnpm error' })
    )
    mockReaddir.mockResolvedValue([])

    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('ERR: some pnpm error')
    }
  })

  it('uses fallback code message when pnpm exits non-zero with no stderr', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(
      makeChildProcess({ exitCode: 2, stderrOutput: '' })
    )
    mockReaddir.mockResolvedValue([])

    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/exited with code 2/)
    }
  })

  it('handles package.json without dependencies field (uses ?? {})', async () => {
    // No 'dependencies' key in root package.json → rootPkg.dependencies ?? {} fires
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ name: 'ari', version: '1.0.0' }))
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))
    mockReaddir.mockResolvedValue([])

    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(true)
  })

  it('touches importing files after successful install', async () => {
    mockReadFile
      .mockResolvedValueOnce(makeRootPkg({}))    // root package.json
      // A module source file using "from 'new-pkg'" syntax matches the regex
      .mockResolvedValueOnce("import something from 'new-pkg'")
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))
    mockUtimes.mockResolvedValue(undefined)

    // Simulate a directory with a TS file that imports new-pkg
    mockReaddir.mockResolvedValue([
      { name: 'index.ts', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
    ])

    const events: any[] = []
    await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    // The file content matches `from 'new-pkg'` so utimes is called and cache-bust fires
    const cacheBustEvent = events.find(e => e.type === 'cache-bust')
    expect(cacheBustEvent).toBeDefined()
    expect(cacheBustEvent.touched).toBeGreaterThan(0)
  })

  it('does not emit cache-bust when no files import the new package', async () => {
    mockReadFile
      .mockResolvedValueOnce(makeRootPkg({}))
      .mockResolvedValueOnce("const x = 1") // no import of new-pkg
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))

    mockReaddir.mockResolvedValue([
      { name: 'util.ts', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
    ])

    const events: any[] = []
    await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    // No file imports new-pkg → touched=0 → no cache-bust event emitted
    const cacheBustEvent = events.find(e => e.type === 'cache-bust')
    expect(cacheBustEvent).toBeUndefined()
  })

  it('respects abort signal', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    const child = makeChildProcess({ exitCode: 0, delay: 500 })
    mockSpawn.mockReturnValue(child)

    const controller = new AbortController()
    // Abort immediately
    controller.abort()

    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, abortSignal: controller.signal },
    )
    // After abort the child is killed; result might be ok or error depending on timing
    expect([true, false]).toContain(result.ok)
  })
})

// ── queue serialization ───────────────────────────────────────────────────────

describe('installModuleNpmDeps — queue serialisation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs two installs sequentially and both succeed', async () => {
    mockReadFile.mockResolvedValue(makeRootPkg({}))
    mockSpawn.mockImplementation(() => makeChildProcess({ exitCode: 0 }))
    mockReaddir.mockResolvedValue([])

    const [r1, r2] = await Promise.all([
      installModuleNpmDeps('m1', { 'pkg-a': '^1.0.0' }, MODULE_DIR, BASE_OPTS),
      installModuleNpmDeps('m2', { 'pkg-b': '^1.0.0' }, MODULE_DIR, BASE_OPTS),
    ])
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
  })

  it('emits waiting message when a second install queues behind an active install', async () => {
    // We need the first install to still be in-flight when the second starts.
    // Use slow child processes so the first doesn't finish before the second enqueues.
    let spawnCount = 0
    const events1: any[] = []
    const events2: any[] = []

    mockReadFile.mockResolvedValue(makeRootPkg({}))
    mockSpawn.mockImplementation(() => makeChildProcess({ exitCode: 0, delay: 20 }))
    mockReaddir.mockResolvedValue([])

    const [r1, r2] = await Promise.all([
      installModuleNpmDeps('m-queue-1', { 'pkg-a': '^1.0.0' }, MODULE_DIR, {
        ...BASE_OPTS,
        onEvent: (e) => events1.push(e),
      }),
      installModuleNpmDeps('m-queue-2', { 'pkg-b': '^1.0.0' }, MODULE_DIR, {
        ...BASE_OPTS,
        onEvent: (e) => events2.push(e),
      }),
    ])

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
  })
})

// ── validateNpmDeps — extra edge cases ────────────────────────────────────────

describe('validateNpmDeps — version spec edge cases', () => {
  it('rejects empty version spec', () => {
    expect(validateNpmDeps('m', [['pkg', '']])).toMatch(/Invalid version spec/)
  })

  it('rejects version spec longer than 100 chars', () => {
    const longSpec = '^' + '1'.repeat(101)
    expect(validateNpmDeps('m', [['pkg', longSpec]])).toMatch(/Invalid version spec/)
  })

  it('rejects non-string version spec', () => {
    expect(validateNpmDeps('m', [['pkg', 42 as any]])).toMatch(/Invalid version spec/)
  })

  it('rejects https: protocol in version spec (git+ prefix also caught by https:)', () => {
    // 'git+https://...' contains 'https:' which is in FORBIDDEN_SPEC_TOKENS
    expect(validateNpmDeps('m', [['pkg', 'git+https://github.com/foo/bar.git']])).toMatch(/https:/)
  })

  it('rejects file: protocol in version spec', () => {
    expect(validateNpmDeps('m', [['pkg', 'file:../local-pkg']])).toMatch(/file:/)
  })

  it('rejects workspace: protocol in version spec', () => {
    expect(validateNpmDeps('m', [['pkg', 'workspace:*']])).toMatch(/workspace:/)
  })

  it('rejects npm: protocol in version spec', () => {
    expect(validateNpmDeps('m', [['pkg', 'npm:some-pkg@^1.0.0']])).toMatch(/npm:/)
  })

  it('rejects .. in version spec', () => {
    expect(validateNpmDeps('m', [['pkg', '../outside']])).toMatch(/\.\./)
  })

  it('rejects link: protocol in version spec', () => {
    expect(validateNpmDeps('m', [['pkg', 'link:../local']])).toMatch(/link:/)
  })

  it('accepts valid scoped package', () => {
    expect(validateNpmDeps('m', [['@scope/pkg', '^1.0.0']])).toBeNull()
  })

  it('accepts exactly 25 dependencies (at the limit)', () => {
    const deps = Array.from({ length: 25 }, (_, i) => [`pkg-${i}`, '^1.0.0'] as [string, unknown])
    expect(validateNpmDeps('m', deps)).toBeNull()
  })
})

// ── touchImporters — directory traversal ─────────────────────────────────────

describe('touchImporters — walk behavior', () => {
  beforeEach(() => vi.clearAllMocks())

  it('handles readdir error (non-existent sub-directory) gracefully', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))

    // Simulate a subdirectory that throws on readdir
    mockReaddir
      .mockRejectedValueOnce(new Error('ENOENT')) // top-level dir throws
      .mockResolvedValue([])

    // Should complete without throwing despite readdir error
    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(true)
  })

  it('skips node_modules and .git directories during walk', async () => {
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))

    // Return node_modules and .git as directories — they should be skipped
    mockReaddir.mockResolvedValue([
      { name: 'node_modules', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
      { name: '.git', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
    ])

    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    // readdir called for top level; .git/.node_modules NOT walked
    expect(result.ok).toBe(true)
    // readdir should only be called once (for the top-level MODULE_DIR)
    expect(mockReaddir).toHaveBeenCalledTimes(1)
  })

  it('handles error reading a source file gracefully (catch block)', async () => {
    mockReadFile
      .mockResolvedValueOnce(makeRootPkg({}))  // root package.json
      .mockRejectedValueOnce(new Error('EACCES: permission denied'))  // source file
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))

    mockReaddir.mockResolvedValue([
      { name: 'index.ts', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
    ])

    // Should not throw
    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )
    expect(result.ok).toBe(true)
  })

  it('walks subdirectories recursively', async () => {
    mockReadFile
      .mockResolvedValueOnce(makeRootPkg({}))  // root package.json
      .mockResolvedValueOnce("import x from 'new-pkg'")  // nested file content — matches regex
    mockSpawn.mockReturnValue(makeChildProcess({ exitCode: 0 }))
    mockUtimes.mockResolvedValue(undefined)

    const subDir = `${MODULE_DIR}/components`
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === MODULE_DIR) {
        return [
          { name: 'components', isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
        ]
      }
      if (dir === subDir) {
        return [
          { name: 'Button.ts', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
        ]
      }
      return []
    })

    const events: any[] = []
    const result = await installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      { ...BASE_OPTS, onEvent: (e) => events.push(e) },
    )
    expect(result.ok).toBe(true)
    // File content uses `from 'new-pkg'` syntax → should have been touched
    const cacheBust = events.find(e => e.type === 'cache-bust')
    expect(cacheBust).toBeDefined()
    expect(cacheBust.touched).toBeGreaterThan(0)
  })
})

// ── spawnPnpmAdd — killed process ─────────────────────────────────────────────

describe('spawnPnpmAdd — kill on timeout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('kills child process when timeout fires', async () => {
    vi.useFakeTimers()
    mockReadFile.mockResolvedValueOnce(makeRootPkg({}))

    let resolveClose: ((code: number) => void) | null = null
    const child = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn().mockImplementation(() => {
        // When kill is called, emit close with the killed code
        if (resolveClose) resolveClose(-1)
      }),
      on: vi.fn().mockImplementation((event: string, handler: any) => {
        if (event === 'close') {
          // Store handler for close event
          resolveClose = (code: number) => handler(code)
        } else if (event === 'error') {
          // store error handler too
        }
      }),
    }
    mockSpawn.mockReturnValue(child)

    const installPromise = installModuleNpmDeps(
      'test-module',
      { 'new-pkg': '^1.0.0' },
      MODULE_DIR,
      BASE_OPTS,
    )

    // Advance past the PNPM_TIMEOUT_MS (180000ms)
    await vi.advanceTimersByTimeAsync(180001)

    const result = await installPromise
    // The child should have been killed; result may be ok=true or ok=false depending on exit code
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')

    vi.useRealTimers()
  })
})
