/**
 * Tests for the installer's "download ARI" step, run against real git
 * repositories in a temp directory. Prompts and the dependency install are
 * supplied by the test; everything else is the installer's own code.
 *
 * A lab suite: slower than the rest, and left out of the test report that is
 * generated on every dev boot. See vitest.config.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLab, useLabEnvironment, type Lab } from '../ari-cli/harness'

type CloneResult = {
  cloned: boolean
  dir: string | null
  depsInstalled?: boolean
  fatal?: string[]
}
type Installer = {
  cloneAndSetup: (options: Record<string, unknown>) => Promise<CloneResult>
  isPathInUse: (target: string) => boolean
  isYes: (answer: unknown, defaultYes: boolean) => boolean
  pinToRelease: (
    targetDir: string,
    requested?: string,
  ) => { ok: boolean; version?: string; reason?: string }
}

const posix = process.platform === 'win32' ? describe.skip : describe

let installer: Installer

beforeAll(async () => {
  // Defines everything, runs nothing.
  vi.stubEnv('ARI_INSTALLER_IMPORT_ONLY', '1')
  installer = (await import('@/scripts/install.mjs')) as unknown as Installer
})

posix('downloading ARI', { timeout: 120_000 }, () => {
  let lab: Lab
  let counter = 0

  let restoreEnvironment = () => {}

  beforeAll(() => {
    lab = createLab()
    // The installer runs git through the shell with the process environment.
    // Whatever the caller had set — GIT_DIR above all, which would aim those
    // commands at the real repository — is taken out for as long as this runs.
    restoreEnvironment = useLabEnvironment(lab.env)
  })
  afterAll(() => {
    restoreEnvironment()
    lab?.cleanup()
  })

  // Every git command the installer runs here must land inside the lab.
  it('runs git against the lab, not the repository the tests run from', () => {
    expect(process.env.GIT_DIR).toBeUndefined()
    expect(process.env.GIT_WORK_TREE).toBeUndefined()
    expect(process.env.GIT_INDEX_FILE).toBeUndefined()
    expect(process.env.GIT_CONFIG_GLOBAL).toBe(lab.env.GIT_CONFIG_GLOBAL)
  })

  const freshPath = () => path.join(lab.root, `target-${++counter}`)
  const versionIn = (dir: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version

  /** Run the step, answering its questions in order. */
  const run = async (opts: {
    version?: string
    branch?: string
    repoUrl?: string
    answers: string[]
  }) => {
    const answers = [...opts.answers]
    const asked: string[] = []
    const result = await installer.cloneAndSetup({
      version: opts.version ?? 'latest',
      branch: opts.branch ?? 'main',
      repoUrl: opts.repoUrl ?? lab.upstream,
      ask: async (question: string) => {
        asked.push(question)
        return answers.shift() ?? ''
      },
      confirm: async (question: string) => {
        asked.push(question)
        return installer.isYes(answers.shift() ?? '', true)
      },
      install: async (dir: string) => ({ cloned: true, dir, depsInstalled: true }),
      lookupTimeoutMs: 5000,
    })
    return { result, asked }
  }

  describe('into a new folder', () => {
    it('installs the latest release by default, not the tip of main', async () => {
      const target = freshPath()
      const { result } = await run({ answers: [target] })

      expect(result).toMatchObject({ cloned: true, dir: target })
      expect(versionIn(target)).toBe('2.0.10')
      expect(fs.existsSync(path.join(target, 'unreleased.txt'))).toBe(false)
    })

    it('installs a release asked for by name', async () => {
      const target = freshPath()
      const { result } = await run({ version: '2.0.9', answers: [target] })

      expect(result.cloned).toBe(true)
      expect(versionIn(target)).toBe('2.0.9')
    })

    it('installs the tip of main for edge', async () => {
      const target = freshPath()
      await run({ version: 'edge', answers: [target] })

      expect(fs.existsSync(path.join(target, 'unreleased.txt'))).toBe(true)
    })

    it('leaves the install on a branch named main that follows upstream', async () => {
      const target = freshPath()
      await run({ answers: [target] })
      const install = lab.install('2.0.8')
      const git = (...args: string[]) => install.git('-C', target, ...args)

      expect(git('symbolic-ref', '--short', 'HEAD')).toBe('main')
      expect(git('config', 'branch.main.remote')).toBe('upstream')
      expect(git('remote')).toBe('upstream')
    })

    // A user's git can be set up to name the first remote something other than
    // origin; renaming origin afterwards would then fail.
    it('names the remote upstream whatever the default remote name is', async () => {
      const config = path.join(lab.root, 'gitconfig-custom-remote')
      fs.writeFileSync(config, '[clone]\n\tdefaultRemoteName = mine\n')
      process.env.GIT_CONFIG_GLOBAL = config
      const target = freshPath()
      try {
        const { result } = await run({ answers: [target] })

        expect(result.cloned).toBe(true)
        expect(lab.install('2.0.8').git('-C', target, 'remote')).toBe('upstream')
      } finally {
        process.env.GIT_CONFIG_GLOBAL = lab.env.GIT_CONFIG_GLOBAL
      }
    })

    it('falls back to main with no fatal error when the repository has no releases', async () => {
      const noTags = path.join(lab.root, 'no-tags.git')
      const helper = lab.install('2.0.8')
      helper.git('clone', '-q', '--bare', lab.upstream, noTags)
      for (const tag of helper.git('--git-dir', noTags, 'tag', '-l').split('\n')) {
        helper.git('--git-dir', noTags, 'tag', '-d', tag)
      }
      const target = freshPath()
      const { result } = await run({ repoUrl: noTags, answers: [target] })

      expect(result.cloned).toBe(true)
      expect(result.fatal).toBeUndefined()
      expect(fs.existsSync(path.join(target, 'unreleased.txt'))).toBe(true)
    })
  })

  describe('a release asked for by name that cannot be delivered', () => {
    it('stops before asking anything when the release does not exist', async () => {
      const target = freshPath()
      const { result, asked } = await run({ version: '2.0.99', answers: [target] })

      expect(result.cloned).toBe(false)
      expect(result.dir).toBeNull()
      expect(result.fatal?.[0]).toContain('ARI 2.0.99 is not a released version')
      expect(asked).toEqual([])
      expect(fs.existsSync(target)).toBe(false)
    })

    it('stops when the download fails, without blaming the network', async () => {
      const target = path.join(lab.root, 'a-file-not-a-folder', 'ARI')
      fs.writeFileSync(path.join(lab.root, 'a-file-not-a-folder'), 'x')
      const { result } = await run({ version: '2.0.9', answers: [target] })

      expect(result.fatal?.[0]).toContain('ARI 2.0.9 was not installed')
      expect(result.fatal?.join(' ')).not.toMatch(/network/i)
      expect(result.dir).toBeNull()
    })
  })

  describe('when the chosen folder already exists', () => {
    const existingInstall = () => lab.install('2.0.8').dir

    it('offers to reuse it when no version was named', async () => {
      const existing = existingInstall()
      const { result, asked } = await run({ answers: [existing, 'yes'] })

      expect(asked).toContain('Use existing directory?')
      expect(result).toMatchObject({ cloned: true, dir: existing })
      expect(versionIn(existing)).toBe('2.0.8')
    })

    it('never reuses it for a release asked for by name', async () => {
      const existing = existingInstall()
      const { result, asked } = await run({ version: '2.0.10', answers: [existing, 'yes'] })

      expect(asked).not.toContain('Use existing directory?')
      expect(result.dir).toBe(existing + '-2')
      expect(versionIn(existing + '-2')).toBe('2.0.10')
      expect(versionIn(existing)).toBe('2.0.8')
    })

    it('does not mistake an unrelated project for ARI, and leaves it alone', async () => {
      const other = freshPath()
      fs.mkdirSync(other)
      fs.writeFileSync(
        path.join(other, 'package.json'),
        '{"name":"something-else","version":"1.4.0"}',
      )
      const { result } = await run({ version: '2.0.10', answers: [other, 'yes'] })

      expect(result.dir).toBe(other + '-2')
      expect(versionIn(other)).toBe('1.4.0')
    })

    it.each([
      ['the same folder again', (existing: string) => existing],
      ['a file', (existing: string) => path.join(existing, 'package.json')],
    ])('stops when the path typed instead is %s', async (_label, pick) => {
      const existing = existingInstall()
      const { result } = await run({ version: '2.0.10', answers: [existing, 'no', pick(existing)] })

      expect(result.cloned).toBe(false)
      expect(result.fatal?.[0]).toContain('already exists and is in use')
      expect(versionIn(existing)).toBe('2.0.8')
    })

    it('accepts an existing empty folder', async () => {
      const existing = existingInstall()
      const empty = freshPath()
      fs.mkdirSync(empty)
      const { result } = await run({ version: '2.0.10', answers: [existing, 'no', empty] })

      expect(result).toMatchObject({ cloned: true, dir: empty })
      expect(versionIn(empty)).toBe('2.0.10')
    })
  })

  describe('isPathInUse', () => {
    it('is false for a path that does not exist', () => {
      expect(installer.isPathInUse(path.join(lab.root, 'nothing-here'))).toBe(false)
    })

    it('is false for an empty folder', () => {
      const empty = freshPath()
      fs.mkdirSync(empty)

      expect(installer.isPathInUse(empty)).toBe(false)
    })

    it('is true for a folder with anything in it', () => {
      expect(installer.isPathInUse(lab.root)).toBe(true)
    })

    it('is true for a file', () => {
      const file = freshPath()
      fs.writeFileSync(file, 'x')

      expect(installer.isPathInUse(file)).toBe(true)
    })

    it('is true for a folder that cannot be read', () => {
      const locked = freshPath()
      fs.mkdirSync(locked)
      fs.chmodSync(locked, 0o000)
      try {
        // root can read anything, so there is nothing to observe under it.
        if (process.getuid?.() !== 0) expect(installer.isPathInUse(locked)).toBe(true)
      } finally {
        fs.chmodSync(locked, 0o755)
      }
    })
  })

  describe('pinToRelease', () => {
    it('reports a release that does not exist instead of guessing', async () => {
      const target = freshPath()
      await run({ version: 'edge', answers: [target] })

      expect(installer.pinToRelease(target, '7.7.7')).toMatchObject({
        ok: false,
        reason: expect.stringContaining('ARI 7.7.7 is not a released version'),
      })
      expect(fs.existsSync(path.join(target, 'unreleased.txt'))).toBe(true)
    })
  })
})
