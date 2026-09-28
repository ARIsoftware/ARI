/**
 * Tests for the installer's pure helpers. Its download step is tested against
 * real git repositories in install.lab.test.ts.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

type CloneResult = {
  cloned: boolean
  dir: string | null
  depsInstalled?: boolean
  fatal?: string[]
}
type Installer = {
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
