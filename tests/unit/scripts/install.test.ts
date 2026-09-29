/**
 * Tests for the installer's pure helpers. Its download step is tested against
 * real git repositories in install.lab.test.ts.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type CloneResult = {
  cloned: boolean
  dir: string | null
  depsInstalled?: boolean
  fatal?: string[]
}
type DbResult = { dbCreated?: boolean; supabaseStarted?: boolean } | null
type Installer = {
  concludeInstall: (result: CloneResult | null, db: DbResult, opts?: { dirFile?: string }) => number
  reportFatal: (result: CloneResult | null) => boolean
  installOutcome: (result: CloneResult | null) => string
  isYes: (answer: unknown, defaultYes: boolean) => boolean
  manualCloneCommand: (branch: string, repoUrl: string, targetDir?: string) => string
}

let installer: Installer

beforeAll(async () => {
  // Defines everything, runs nothing.
  vi.stubEnv('ARI_INSTALLER_IMPORT_ONLY', '1')
  installer = (await import('@/scripts/install.mjs')) as unknown as Installer
})

describe('isYes', () => {
  it.each([['y'], ['Y'], ['yes'], ['YES'], [' yes ']])('reads %j as yes', (answer) => {
    expect(installer.isYes(answer, false)).toBe(true)
  })

  it.each([['n'], ['no'], ['yikes'], ['yeah'], ['ok'], ['/Users/you/ARI'], ['y n']])(
    'reads %j as no',
    (answer) => {
      expect(installer.isYes(answer, true)).toBe(false)
    },
  )

  it('uses the default for an empty answer', () => {
    expect(installer.isYes('', true)).toBe(true)
    expect(installer.isYes('  ', false)).toBe(false)
  })
})

describe('installOutcome', () => {
  it('is complete only when ARI was downloaded and its dependencies installed', () => {
    expect(installer.installOutcome({ cloned: true, dir: '/x', depsInstalled: true })).toBe(
      'complete',
    )
  })

  it('says when the dependencies are missing', () => {
    expect(installer.installOutcome({ cloned: true, dir: '/x', depsInstalled: false })).toBe(
      'dependencies-missing',
    )
  })

  it.each([
    [null],
    [{ cloned: false, dir: null }],
    [{ cloned: false, dir: '/x' }],
    [{ cloned: true, dir: null }],
  ])('is not installed for %j', (result) => {
    expect(installer.installOutcome(result as CloneResult | null)).toBe('not-installed')
  })
})

describe('manualCloneCommand', () => {
  it('clones main without a branch flag, into a remote named upstream', () => {
    expect(installer.manualCloneCommand('main', 'https://example.test/ari.git', '/tmp/ARI')).toBe(
      'git clone --origin upstream https://example.test/ari.git "/tmp/ARI"',
    )
  })

  it('names another branch', () => {
    expect(installer.manualCloneCommand('develop', 'https://example.test/ari.git')).toBe(
      'git clone --origin upstream --branch develop https://example.test/ari.git',
    )
  })
})

describe('the end of the install', () => {
  const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
  let printed: string[]
  let scratch: string
  let dirFile: string

  beforeEach(() => {
    printed = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' ').replace(ANSI, ''))
    })
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ari-install-end-'))
    dirFile = path.join(scratch, 'install-dir')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(scratch, { recursive: true, force: true })
  })

  const screen = () => printed.join('\n')
  const noted = () => (fs.existsSync(dirFile) ? fs.readFileSync(dirFile, 'utf8') : null)

  describe('when ARI was installed', () => {
    const installed = { cloned: true, dir: '/home/you/ARI', depsInstalled: true }

    it('says so, and exits 0', () => {
      expect(installer.concludeInstall(installed, {}, { dirFile })).toBe(0)
      expect(screen()).toContain('Installation Complete!')
      expect(screen()).not.toContain('Not Finished')
    })

    it('says how to start ARI', () => {
      installer.concludeInstall(installed, {}, { dirFile })

      expect(screen()).toContain('To start ARI')
      expect(screen()).toMatch(/ari(\.cmd)? start/)
    })

    it('tells the shell wrapper which folder to move into', () => {
      installer.concludeInstall(installed, {}, { dirFile })

      expect(noted()).toBe('/home/you/ARI')
    })
  })

  describe('when ARI was downloaded but its dependencies were not installed', () => {
    const halfDone = { cloned: true, dir: '/home/you/ARI', depsInstalled: false }

    it('does not call the install complete, and exits 1', () => {
      expect(installer.concludeInstall(halfDone, null, { dirFile })).toBe(1)
      expect(screen()).toContain('Installation Not Finished')
      expect(screen()).not.toContain('Installation Complete!')
    })

    it('says what is missing and how to finish', () => {
      installer.concludeInstall(halfDone, null, { dirFile })

      expect(screen()).toContain('its dependencies were not installed')
      expect(screen()).toContain('cd "/home/you/ARI" && pnpm install')
    })

    it('still notes the folder, which is there to be finished', () => {
      installer.concludeInstall(halfDone, null, { dirFile })

      expect(noted()).toBe('/home/you/ARI')
    })
  })

  describe.each([
    ['nothing was downloaded', { cloned: false, dir: null }],
    ['the download failed', { cloned: false, dir: null, depsInstalled: false }],
    // A folder was chosen, but nothing usable is in it.
    ['the download failed after a folder was chosen', { cloned: false, dir: '/home/you/ARI' }],
    ['there is no result at all', null],
  ])('when %s', (_name, result) => {
    it('does not call the install complete, and exits 1', () => {
      expect(installer.concludeInstall(result, null, { dirFile })).toBe(1)
      expect(screen()).toContain('Installation Not Finished')
      expect(screen()).not.toContain('Installation Complete!')
    })

    it('says ARI was not downloaded and how to get it by hand', () => {
      installer.concludeInstall(result, null, { dirFile })

      expect(screen()).toContain('ARI itself was not downloaded')
      expect(screen()).toContain(
        'git clone --origin upstream https://github.com/ARIsoftware/ARI.git',
      )
      expect(screen()).not.toContain('To start ARI, navigate')
    })

    it('notes no folder, so the shell wrapper has nowhere to move into', () => {
      installer.concludeInstall(result, null, { dirFile })

      expect(noted()).toBeNull()
    })
  })

  it('works without a place to note the folder', () => {
    const installed = { cloned: true, dir: '/home/you/ARI', depsInstalled: true }

    expect(installer.concludeInstall(installed, {}, { dirFile: '' })).toBe(0)
  })

  it('is not stopped by a note that cannot be written', () => {
    const installed = { cloned: true, dir: '/home/you/ARI', depsInstalled: true }
    const unwritable = path.join(scratch, 'no-such-folder', 'install-dir')

    expect(installer.concludeInstall(installed, {}, { dirFile: unwritable })).toBe(0)
  })

  describe('reportFatal', () => {
    it('prints the headline and every detail, and says it did', () => {
      const result = {
        cloned: false,
        dir: null,
        fatal: ['ARI 2.0.99 is not a released version.', 'See the list.', 'Or leave it unset.'],
      }

      expect(installer.reportFatal(result)).toBe(true)
      expect(screen()).toContain('ARI 2.0.99 is not a released version.')
      expect(screen()).toContain('See the list.')
      expect(screen()).toContain('Or leave it unset.')
    })

    it.each([
      [{ cloned: true, dir: '/x', depsInstalled: true }],
      [{ cloned: false, dir: null }],
      [null],
    ])('prints nothing for %j', (result) => {
      expect(installer.reportFatal(result as CloneResult | null)).toBe(false)
      expect(printed).toEqual([])
    })
  })
})
