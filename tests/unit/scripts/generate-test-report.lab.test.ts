/**
 * The inputs fingerprint against real git repositories: what makes it change,
 * what leaves it alone, and when it refuses to answer. The rules it feeds are
 * covered by generate-test-report.test.ts.
 *
 * A lab suite: slower than the rest, and left out of the test report that is
 * generated on every dev boot. See vitest.config.ts.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeInputsFingerprint } from '@/scripts/generate-test-report.mjs'
import { createWorkspace, forSpawn, LAB_NODE, REPO_ROOT, type Workspace } from '../ari-cli/harness'

const posix = process.platform === 'win32' ? describe.skip : describe

posix('generate-test-report as the entry script', { timeout: 60_000 }, () => {
  it('runs when started through a symlinked checkout path', () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ari-report-link-'))
    try {
      const link = path.join(dir, 'ARI')
      fs.symlinkSync(REPO_ROOT, link, 'dir')
      const script = path.join(link, 'scripts', 'generate-test-report.mjs')
      expect(fs.realpathSync(script)).not.toBe(script) // the path really is a symlinked one
      // ARI_SKIP_TEST_REPORT keeps Vitest out of it: the message proves the entry guard fired.
      const result = spawnSync(LAB_NODE, [script], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, ARI_SKIP_TEST_REPORT: '1' },
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('[test-report] Skipped (ARI_SKIP_TEST_REPORT=1)')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('computeInputsFingerprint', { timeout: 60_000 }, () => {
  let workspace: Workspace
  let counter = 0

  beforeAll(() => {
    workspace = createWorkspace()
  })
  afterAll(() => workspace?.cleanup())

  const fingerprint = (dir: string, options: Record<string, unknown> = {}) =>
    computeInputsFingerprint(dir, { env: forSpawn(workspace.env), ...options })

  /** A repository with one commit holding a tracked file. */
  const repository = () => {
    const dir = path.join(workspace.root, `repo-${++counter}`)
    fs.mkdirSync(dir)
    const git = workspace.gitIn(dir)
    git('init', '-q', '-b', 'main')
    const write = (file: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), content)
    }
    write('lib/a.ts', 'export const a = 1\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'Initial')
    return { dir, git, write }
  }

  it('is stable while nothing changes', () => {
    const { dir } = repository()
    const first = fingerprint(dir)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(fingerprint(dir)).toBe(first)
  })

  it('differs between repositories at different commits', () => {
    const a = repository()
    const b = repository()
    b.write('lib/b.ts', 'export const b = 2\n')
    b.git('add', '-A')
    b.git('commit', '-q', '-m', 'Second')
    expect(fingerprint(a.dir)).not.toBe(fingerprint(b.dir))
  })

  it('changes when a tracked file is edited, and again when the edit is committed', () => {
    const { dir, git, write } = repository()
    const clean = fingerprint(dir)
    write('lib/a.ts', 'export const a = 2 // edited\n')
    const edited = fingerprint(dir)
    expect(edited).not.toBe(clean)
    git('add', '-A')
    expect(fingerprint(dir)).toBe(edited) // staging alone changes nothing that matters
    git('commit', '-q', '-m', 'Edit')
    const committed = fingerprint(dir)
    expect(committed).not.toBe(edited)
    expect(committed).not.toBe(clean)
    expect(fingerprint(dir)).toBe(committed)
  })

  it('changes when an untracked file appears and returns when it is gone', () => {
    const { dir, write } = repository()
    const clean = fingerprint(dir)
    write('modules-custom/my module/module.json', '{"id":"my-module"}\n')
    expect(fingerprint(dir)).not.toBe(clean)
    fs.rmSync(path.join(dir, 'modules-custom'), { recursive: true })
    expect(fingerprint(dir)).toBe(clean)
  })

  it('changes when a changed file is merely touched', () => {
    const { dir, write } = repository()
    write('lib/a.ts', 'export const a = 3\n')
    const before = fingerprint(dir)
    const file = path.join(dir, 'lib/a.ts')
    const later = new Date(fs.statSync(file).mtimeMs + 10_000)
    fs.utimesSync(file, later, later)
    expect(fingerprint(dir)).not.toBe(before)
  })

  it('changes when a tracked file is deleted from disk', () => {
    const { dir } = repository()
    const clean = fingerprint(dir)
    fs.rmSync(path.join(dir, 'lib/a.ts'))
    expect(fingerprint(dir)).not.toBe(clean)
  })

  it('leaves ignored files out', () => {
    const { dir, git, write } = repository()
    write('.gitignore', 'lib/generated/\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'Ignore generated')
    const clean = fingerprint(dir)
    write('lib/generated/test-report.json', '{"success":true}\n')
    expect(fingerprint(dir)).toBe(clean)
  })

  it('changes with the Node version it runs under', () => {
    const { dir } = repository()
    expect(fingerprint(dir, { nodeVersion: 'v99.0.0' })).not.toBe(fingerprint(dir))
  })

  it('answers null outside a repository and before the first commit', () => {
    const plain = path.join(workspace.root, `plain-${++counter}`)
    fs.mkdirSync(plain)
    expect(fingerprint(plain)).toBeNull()

    const empty = path.join(workspace.root, `empty-${++counter}`)
    fs.mkdirSync(empty)
    workspace.gitIn(empty)('init', '-q', '-b', 'main')
    expect(fingerprint(empty)).toBeNull()
  })
})
