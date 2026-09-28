/**
 * Tests for the updater's pure helpers. The update flow itself is tested
 * against real git repositories in updater.lab.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { fileListLines, isAttended, unattendedGitEnv } from '@/scripts/lib/updater.js'

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

describe('isAttended', () => {
  it('is attended when stdin is a terminal', () => {
    expect(isAttended({ stdinIsTTY: true, platform: 'darwin', env: {} })).toBe(true)
    expect(isAttended({ stdinIsTTY: true, platform: 'win32', env: {} })).toBe(true)
    expect(isAttended({ stdinIsTTY: true, platform: 'linux', env: { CI: 'true' } })).toBe(true)
  })

  it.each([['darwin'], ['linux']])('is unattended on %s when stdin is piped', (platform) => {
    expect(isAttended({ stdinIsTTY: false, platform, env: { TERM_PROGRAM: 'mintty' } })).toBe(false)
  })

  it('is unattended on Windows when stdin is piped in an ordinary console', () => {
    expect(isAttended({ stdinIsTTY: false, platform: 'win32', env: {} })).toBe(false)
  })

  // Git Bash connects programs through pipes, so Node sees no terminal there
  // even with someone typing. Treating it as unattended would switch off the
  // credential prompts a private mirror needs.
  it('is attended in a Git Bash window on Windows', () => {
    const env = { TERM_PROGRAM: 'mintty', MSYSTEM: 'MINGW64' }

    expect(isAttended({ stdinIsTTY: false, platform: 'win32', env })).toBe(true)
  })

  // MSYSTEM is set for everything run through Git's bash: a CI step, a
  // scheduled script, a tool running commands. Nobody is there to answer.
  it.each([[{ MSYSTEM: 'MINGW64' }], [{ MSYSTEM: 'MSYS' }]])(
    'is unattended on Windows when only %j says bash',
    (env) => {
      expect(isAttended({ stdinIsTTY: false, platform: 'win32', env })).toBe(false)
    },
  )

  it('is unattended in CI even when the variables of a Git Bash window are present', () => {
    const env = { TERM_PROGRAM: 'mintty', MSYSTEM: 'MINGW64', CI: 'true' }

    expect(isAttended({ stdinIsTTY: false, platform: 'win32', env })).toBe(false)
  })
})

describe('unattendedGitEnv', () => {
  it('switches off every way git could stop and ask', () => {
    const env = unattendedGitEnv({ HOME: '/home/u' }, { sshCommandConfigured: false })

    expect(env).toMatchObject({
      HOME: '/home/u',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      SSH_ASKPASS_REQUIRE: 'never',
      GIT_SSH_COMMAND: 'ssh -oBatchMode=yes',
    })
  })

  it("keeps the user's own ssh command from the environment", () => {
    const env = unattendedGitEnv(
      { GIT_SSH_COMMAND: 'ssh -i ~/.ssh/mirror' },
      { sshCommandConfigured: false },
    )

    expect(env.GIT_SSH_COMMAND).toBe('ssh -i ~/.ssh/mirror')
  })

  // GIT_SSH names the ssh program (plink with Pageant, TortoiseGit). git ranks
  // GIT_SSH_COMMAND above it, so adding one would switch programs.
  it("keeps the user's own ssh program", () => {
    const env = unattendedGitEnv({ GIT_SSH: '/opt/putty/plink' }, { sshCommandConfigured: false })

    expect(env.GIT_SSH_COMMAND).toBeUndefined()
    expect(env.GIT_SSH).toBe('/opt/putty/plink')
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })

  it("does not override an ssh command set in the user's git config", () => {
    const env = unattendedGitEnv({}, { sshCommandConfigured: true })

    expect(env.GIT_SSH_COMMAND).toBeUndefined()
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })

  it('does not change the environment it was given', () => {
    const original = { HOME: '/home/u' }
    unattendedGitEnv(original, { sshCommandConfigured: false })

    expect(original).toEqual({ HOME: '/home/u' })
  })
})

describe('fileListLines', () => {
  const plain = (files: string[]) =>
    fileListLines(files).map((line: string) => line.replace(ANSI, '').trim())

  it('lists every file when there are few', () => {
    expect(plain(['a.txt', 'b.txt'])).toEqual(['a.txt', 'b.txt'])
  })

  it('lists exactly twenty without a remainder line', () => {
    const files = Array.from({ length: 20 }, (_, i) => `f${i}`)

    expect(plain(files)).toEqual(files)
  })

  it('cuts off after twenty and says how many are left', () => {
    const files = Array.from({ length: 35 }, (_, i) => `f${i}`)
    const out = plain(files)

    expect(out).toHaveLength(21)
    expect(out.at(-1)).toBe('... and 15 more')
  })

  it('returns nothing for no files', () => {
    expect(fileListLines([])).toEqual([])
  })
})
