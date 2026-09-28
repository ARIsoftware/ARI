/**
 * Tests for the update command's flow, run in-process against real git
 * repositories. The end-to-end tests in tests/unit/ari-cli cover the same
 * command through the real CLI; these reach what only shows from inside:
 * what git is told when nobody is present, time limits, and the startup check.
 *
 * A lab suite: slower than the rest, and left out of the test report that is
 * generated on every dev boot. See vitest.config.ts.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  checkForRelease,
  createGit,
  readInstalledVersion,
  runUpdate,
} from '@/scripts/lib/updater.js'
import { createLab, type Install, type Lab } from '../../ari-cli/harness'

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

const posix = process.platform === 'win32' ? describe.skip : describe

posix('against real repositories', { timeout: 120_000 }, () => {
  let lab: Lab
  beforeAll(() => {
    lab = createLab()
  })
  afterAll(() => lab?.cleanup())

  /**
   * A lab of the test's own, for tests that publish a release. Publishing
   * changes what "latest" is for everything sharing that upstream, so the lab
   * the other tests use is never published to.
   */
  const ownLabs: Lab[] = []
  const ownLab = () => {
    const own = createLab()
    ownLabs.push(own)
    return own
  }
  afterAll(() => {
    for (const own of ownLabs) own.cleanup()
  })

  /** Run the update in-process; answers are handed out one per prompt. */
  const update = async (
    install: Install,
    opts: {
      argv?: string[]
      answers?: (string | null)[]
      env?: Record<string, string | undefined>
      stdinIsTTY?: boolean
      platform?: string
      timeouts?: { lookupMs?: number; fetchMs?: number }
      afterMerge?: () => boolean | Promise<boolean>
    } = {},
  ) => {
    const out: string[] = []
    const asked: string[] = []
    const answers = [...(opts.answers ?? [])]
    const code = await runUpdate({
      argv: opts.argv ?? [],
      root: install.dir,
      log: (line: string) => out.push(line.replace(ANSI, '')),
      ask: async (question: string) => {
        asked.push(question.trim())
        return answers.length > 0 ? (answers.shift() as string | null) : null
      },
      env: { ...lab.env, ...opts.env },
      stdinIsTTY: opts.stdinIsTTY ?? false,
      platform: opts.platform ?? 'linux',
      timeouts: opts.timeouts,
      afterMerge: opts.afterMerge,
    })
    return { code, out: out.join('\n'), asked }
  }

  const withFakeGit = (extra: Record<string, string | undefined> = {}) => ({
    PATH: lab.fakeGitDir + path.delimiter + lab.env.PATH,
    ...extra,
  })

  describe('createGit', () => {
    it('reports a missing git as missing, not as a failed command', () => {
      const install = lab.install('2.0.8')
      const git = createGit(install.dir, { ...lab.env, PATH: path.join(lab.root, 'nowhere') })

      expect(git(['--version'])).toMatchObject({ status: null, failure: 'missing' })
    })

    it('reports a command that ran out of time as a timeout', () => {
      const install = lab.install('2.0.8')
      const git = createGit(install.dir, {
        ...lab.env,
        ...withFakeGit({ ARI_FAKE_GIT_HANG: 'ls-remote' }),
      })

      expect(git(['ls-remote', '--tags', 'upstream'], { timeout: 400 })).toMatchObject({
        status: null,
        failure: 'timeout',
      })
    })

    it('reports an ordinary failure with its exit code', () => {
      const install = lab.install('2.0.8')
      const git = createGit(install.dir, lab.env)

      expect(git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).toMatchObject({
        status: 1,
        failure: null,
      })
    })
  })

  describe('readInstalledVersion', () => {
    it('reads the version', () => {
      expect(readInstalledVersion(lab.install('2.0.9').dir)).toBe('2.0.9')
    })

    it.each([['not json'], ['{}'], ['{"version":""}'], ['{"version":5}']])(
      'returns null for package.json %j',
      (content) => {
        const install = lab.install('2.0.8')
        install.write('package.json', content)

        expect(readInstalledVersion(install.dir)).toBeNull()
      },
    )

    it('returns null when there is no package.json', () => {
      expect(readInstalledVersion(path.join(lab.root, 'nowhere'))).toBeNull()
    })
  })

  describe('runUpdate', () => {
    it('returns 0 and moves the install after a yes', async () => {
      const install = lab.install('2.0.8')
      const res = await update(install, { answers: ['yes'] })

      expect(res.code).toBe(0)
      expect(install.head()).toBe(lab.releases['2.0.10'])
      expect(res.asked).toEqual(['Merge these updates? (Y/n)'])
    })

    it('never ends the process itself', async () => {
      const install = lab.install('2.0.10')
      // Reaching the assertion at all is the point: every outcome is a return value.
      expect(await update(install, { argv: ['2.0.9'] }).then((r) => r.code)).toBe(1)
      expect(await update(install, { argv: ['--help'] }).then((r) => r.code)).toBe(0)
      expect(await update(install, { argv: ['--nope'] }).then((r) => r.code)).toBe(1)
      expect(await update(install).then((r) => r.code)).toBe(0)
    })

    it('fails when the dependency install afterwards fails', async () => {
      const install = lab.install('2.0.8')
      const res = await update(install, { answers: ['yes'], afterMerge: () => false })

      expect(res.code).toBe(1)
      expect(res.out).not.toContain('Update complete!')
      // The code did update; only the follow-up failed.
      expect(install.head()).toBe(lab.releases['2.0.10'])
    })

    it('does not run the dependency install when the update is cancelled', async () => {
      const install = lab.install('2.0.8')
      let ran = false
      await update(install, {
        answers: ['no'],
        afterMerge: () => {
          ran = true
          return true
        },
      })

      expect(ran).toBe(false)
    })

    it('links the release notes when the release ships a CHANGELOG.md', async () => {
      const own = ownLab()
      const install = own.install('2.0.10')
      own.publish('2.0.12', { files: { 'CHANGELOG.md': '# Changelog\n' } })
      const res = await update(install, { answers: ['no'] })

      expect(res.out).toContain(
        "What's new: https://github.com/ARIsoftware/ARI/blob/2.0.12/CHANGELOG.md",
      )
    })

    it('does not link release notes the release does not have', async () => {
      const install = lab.install('2.0.8')
      const res = await update(install, { argv: ['2.0.9'], answers: ['no'] })

      expect(res.out).not.toContain("What's new")
    })

    it('points a fork to the command that works when it refuses a named older release', async () => {
      const install = lab.install('2.0.8')
      install.write(
        'package.json',
        JSON.stringify({ name: 'x', version: '3.0.0', type: 'module' }) + '\n',
      )
      install.commit('fork: own version numbers')
      const res = await update(install, { argv: ['2.0.9'], answers: ['yes'] })

      expect(res.code).toBe(1)
      expect(res.out).toContain('Downgrading is not supported')
      expect(res.out).toContain('run ./ari update without a version')
    })

    it('gives no such hint for a real downgrade', async () => {
      const install = lab.install('2.0.10')
      const res = await update(install, { argv: ['2.0.9'], answers: ['yes'] })

      expect(res.code).toBe(1)
      expect(res.out).not.toContain('without a version')
    })
  })

  describe('when nobody is present', () => {
    const envLog = (name: string) => path.join(lab.root, name)
    const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')

    it('tells git not to ask for anything', async () => {
      const install = lab.install('2.0.8')
      const log = envLog('unattended.log')
      await update(install, { answers: ['no'], env: withFakeGit({ ARI_FAKE_GIT_ENVLOG: log }) })

      expect(read(log)).toContain(
        'ls-remote prompt=0 gcm=never ssh=ssh -oBatchMode=yes askpass=never',
      )
    })

    it("leaves the user's own ssh program alone", async () => {
      const install = lab.install('2.0.8')
      const log = envLog('own-ssh-program.log')
      await update(install, {
        answers: ['no'],
        env: withFakeGit({ ARI_FAKE_GIT_ENVLOG: log, GIT_SSH: '/usr/bin/ssh' }),
      })

      expect(read(log)).toContain('prompt=0')
      expect(read(log)).toContain('ssh=unset')
    })

    it("leaves the user's own ssh command alone", async () => {
      const install = lab.install('2.0.8')
      const log = envLog('own-ssh.log')
      await update(install, {
        answers: ['no'],
        env: withFakeGit({ ARI_FAKE_GIT_ENVLOG: log, GIT_SSH_COMMAND: 'ssh -i key' }),
      })

      expect(read(log)).toContain('ssh=ssh -i key')
    })

    it('leaves an ssh command from git config alone', async () => {
      const install = lab.install('2.0.8')
      install.git('config', 'core.sshCommand', 'ssh -i key')
      const log = envLog('config-ssh.log')
      await update(install, { answers: ['no'], env: withFakeGit({ ARI_FAKE_GIT_ENVLOG: log }) })

      expect(read(log)).toContain('prompt=0')
      expect(read(log)).toContain('ssh=unset')
    })

    it('gives up on a lookup that hangs, and says it ran out of time', async () => {
      const install = lab.install('2.0.8')
      const started = Date.now()
      const res = await update(install, {
        answers: ['yes'],
        env: withFakeGit({ ARI_FAKE_GIT_HANG: 'ls-remote' }),
        timeouts: { lookupMs: 1000 },
      })

      expect(res.code).toBe(1)
      expect(res.out).toContain('git did not finish within 1s and was stopped.')
      expect(res.out).toContain('Could not list releases from upstream.')
      expect(Date.now() - started).toBeLessThan(20_000)
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })

    it('gives up on a download that hangs', async () => {
      const own = ownLab()
      const install = own.install('2.0.10')
      own.publish('2.0.13')
      const res = await update(install, {
        answers: ['yes'],
        env: withFakeGit({ ARI_FAKE_GIT_HANG: 'fetch' }),
        timeouts: { fetchMs: 1000 },
      })

      expect(res.code).toBe(1)
      expect(res.out).toContain('Downloading ARI 2.0.13')
      expect(res.out).toContain('did not finish within 1s')
      expect(install.head()).toBe(own.releases['2.0.10'])
    })
  })

  describe('when someone is present', () => {
    it('lets git ask', async () => {
      const install = lab.install('2.0.8')
      const log = path.join(lab.root, 'attended.log')
      const res = await update(install, {
        answers: ['no'],
        stdinIsTTY: true,
        env: withFakeGit({ ARI_FAKE_GIT_ENVLOG: log, GIT_TERMINAL_PROMPT: undefined }),
      })

      expect(res.code).toBe(0)
      expect(fs.readFileSync(log, 'utf8')).toContain(
        'ls-remote prompt=unset gcm=unset ssh=unset askpass=unset',
      )
    })

    it('sets no time limit: a slow lookup is waited for, not cut off', async () => {
      const install = lab.install('2.0.8')
      // The same slow git and short limit that stop an unattended run.
      const res = await update(install, {
        answers: ['no'],
        stdinIsTTY: true,
        env: withFakeGit({ ARI_FAKE_GIT_HANG: 'ls-remote', GIT_TERMINAL_PROMPT: undefined }),
        timeouts: { lookupMs: 1000 },
      })

      expect(res.out).not.toContain('did not finish within')
    })

    it('treats a Git Bash window on Windows as someone present', async () => {
      const install = lab.install('2.0.8')
      const log = path.join(lab.root, 'gitbash.log')
      await update(install, {
        answers: ['no'],
        stdinIsTTY: false,
        platform: 'win32',
        env: withFakeGit({
          ARI_FAKE_GIT_ENVLOG: log,
          GIT_TERMINAL_PROMPT: undefined,
          TERM_PROGRAM: 'mintty',
        }),
      })

      expect(fs.readFileSync(log, 'utf8')).toContain('ls-remote prompt=unset')
    })

    it('treats a command run through Git bash with nobody there as unattended', async () => {
      const install = lab.install('2.0.8')
      const log = path.join(lab.root, 'gitbash-unattended.log')
      await update(install, {
        answers: ['no'],
        stdinIsTTY: false,
        platform: 'win32',
        env: withFakeGit({ ARI_FAKE_GIT_ENVLOG: log, MSYSTEM: 'MINGW64' }),
      })

      expect(fs.readFileSync(log, 'utf8')).toContain('ls-remote prompt=0')
    })
  })

  describe('checkForRelease', () => {
    const check = (
      install: Install,
      opts: {
        env?: Record<string, string | undefined>
        timeoutMs?: number
        fallbackUrl?: string
      } = {},
    ) =>
      checkForRelease({
        root: install.dir,
        env: { ...lab.env, ...opts.env },
        timeoutMs: opts.timeoutMs ?? 5000,
        fallbackUrl: opts.fallbackUrl ?? path.join(lab.root, 'unused.git'),
      })

    it('reports a newer release', async () => {
      expect(await check(lab.install('2.0.8'))).toEqual({ latest: '2.0.10', current: '2.0.8' })
    })

    it('reports nothing when the install is on the latest release', async () => {
      const install = lab.install('2.0.8')
      install.git('remote', 'set-url', 'upstream', lab.staleMirror)
      install.git('checkout', '-q', '-B', 'main', lab.releases['2.0.9'])

      expect(await check(install)).toBeNull()
    })

    it('asks the upstream remote, not the official repository', async () => {
      // The mirror stopped at 2.0.9; the notice must not promise more than
      // `./ari update` can deliver from it.
      const install = lab.install('2.0.8')
      install.git('remote', 'set-url', 'upstream', lab.staleMirror)

      expect(await check(install, { fallbackUrl: lab.upstream })).toEqual({
        latest: '2.0.9',
        current: '2.0.8',
      })
    })

    it('falls back to the official repository when there is no upstream remote', async () => {
      const install = lab.install('2.0.8')
      install.git('remote', 'remove', 'upstream')

      expect(await check(install, { fallbackUrl: lab.staleMirror })).toEqual({
        latest: '2.0.9',
        current: '2.0.8',
      })
    })

    it('reports nothing when upstream cannot be reached', async () => {
      const install = lab.install('2.0.8')
      install.git('remote', 'set-url', 'upstream', path.join(lab.root, 'missing.git'))

      expect(await check(install)).toBeNull()
    })

    it('reports nothing for a folder that is not a git checkout', async () => {
      const dir = path.join(lab.root, 'plain-folder')
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"2.0.8"}')

      expect(
        await checkForRelease({
          root: dir,
          env: { ...lab.env, GIT_CEILING_DIRECTORIES: lab.root },
          timeoutMs: 5000,
          fallbackUrl: lab.upstream,
        }),
      ).toBeNull()
    })

    it('reports nothing when the installed version cannot be read', async () => {
      const install = lab.install('2.0.8')
      install.write('package.json', 'not json')

      expect(await check(install)).toBeNull()
    })

    it('reports nothing for an installed version that is not a release number', async () => {
      const install = lab.install('2.0.8')
      install.write('package.json', '{"version":"2.0.8-custom"}')

      expect(await check(install)).toBeNull()
    })

    it('reports nothing when git is missing', async () => {
      expect(
        await check(lab.install('2.0.8'), { env: { PATH: path.join(lab.root, 'nowhere') } }),
      ).toBeNull()
    })

    it('gives up at its time limit instead of holding up startup', async () => {
      const install = lab.install('2.0.8')
      const started = Date.now()
      const res = await check(install, {
        env: {
          PATH: lab.fakeGitDir + path.delimiter + lab.env.PATH,
          ARI_FAKE_GIT_HANG: 'ls-remote',
        },
        timeoutMs: 600,
      })

      expect(res).toBeNull()
      expect(Date.now() - started).toBeLessThan(3000)
    })

    // `./ari start` does seconds of synchronous work straight after starting
    // the check. Nothing queued on the event loop runs during it, so a lookup
    // that was not already under way would start afterwards and lose to the timer.
    it('still reports when the caller keeps the event loop busy for longer than the limit', async () => {
      const install = lab.install('2.0.8')
      // The lookup takes a second and the limit is 1.5s, so it is in time. The
      // caller is busy for 3s: when it lets go, the answer is waiting and the
      // limit has long passed.
      const pending = check(install, {
        timeoutMs: 1500,
        env: {
          PATH: lab.fakeGitDir + path.delimiter + lab.env.PATH,
          ARI_FAKE_GIT_SLOW: 'ls-remote',
        },
      })
      spawnSync('sleep', ['3'])

      expect(await pending).toEqual({ latest: '2.0.10', current: '2.0.8' })
    })

    it('does not wait for an answer that never comes, however busy the caller was', async () => {
      const install = lab.install('2.0.8')
      const pending = check(install, {
        timeoutMs: 500,
        env: {
          PATH: lab.fakeGitDir + path.delimiter + lab.env.PATH,
          ARI_FAKE_GIT_HANG: 'ls-remote',
        },
      })
      spawnSync('sleep', ['1'])
      const released = Date.now()

      expect(await pending).toBeNull()
      expect(Date.now() - released).toBeLessThan(1500)
    })

    it('leaves an ssh command from git config alone', async () => {
      const install = lab.install('2.0.8')
      install.git('config', 'core.sshCommand', 'ssh -i key')
      const log = path.join(lab.root, 'startup-ssh.log')
      await check(install, {
        env: { PATH: lab.fakeGitDir + path.delimiter + lab.env.PATH, ARI_FAKE_GIT_ENVLOG: log },
      })

      expect(fs.readFileSync(log, 'utf8')).toContain('ls-remote prompt=0 gcm=never ssh=unset')
    })

    it('tells git not to ask for anything', async () => {
      const install = lab.install('2.0.8')
      const log = path.join(lab.root, 'startup.log')
      await check(install, {
        env: { PATH: lab.fakeGitDir + path.delimiter + lab.env.PATH, ARI_FAKE_GIT_ENVLOG: log },
      })

      expect(fs.readFileSync(log, 'utf8')).toContain('ls-remote prompt=0 gcm=never')
    })
  })
})
