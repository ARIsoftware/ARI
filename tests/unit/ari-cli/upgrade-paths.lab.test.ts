/**
 * Updating from every release ARI has shipped.
 *
 * An update is carried out by the version that is already installed, so the
 * code that decides what happens to a user on release day is code written
 * earlier. It cannot be fixed afterwards; it can only be kept working. These
 * tests take each released updater out of this repository's own history,
 * exactly as it was tagged, and run it against today's code.
 *
 * What they guard: a change made today — to the CLI, the launcher, the files
 * the CLI imports, the way the repository is laid out — that an updater already
 * in users' hands cannot cope with.
 *
 * A lab suite: slower than the rest, and left out of the test report that is
 * generated on every dev boot. See vitest.config.ts.
 */
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanEnv, forSpawn, REPO_ROOT, type Install, type RunResult } from './harness'
import {
  createUpgradeLab,
  followsReleases,
  NEXT_VERSION,
  releasedUpdaters,
  releaseTags,
  type ReleasedUpdater,
  type UpgradeLab,
} from './released-updaters'

// The lab runs the launcher, a shell script, and stubs pnpm with one.
const cannotRun = process.platform === 'win32'

const tags = releaseTags()
const updaters = releasedUpdaters()
const label = (updater: ReleasedUpdater) =>
  updater.versions.length === 1
    ? updater.versions[0]
    : `${updater.versions[0]} to ${updater.versions[updater.versions.length - 1]}`

describe('the releases under test', () => {
  // A checkout without tags (a shallow CI checkout, a source download) has no
  // released updaters to run. Locally that is a reason to skip; in CI it would
  // mean this whole suite silently tests nothing.
  it('are available', () => {
    if (tags.length === 0) {
      expect(
        process.env.CI,
        'No release tags in this checkout, so no released updater can be tested. ' +
          'CI must fetch them: actions/checkout with fetch-depth: 0.',
      ).toBeFalsy()
      return
    }
    expect(updaters.length).toBeGreaterThan(0)
  })

  it.skipIf(tags.length === 0)('include every release that kept its CLI in git', () => {
    const covered = updaters.flatMap((updater) => updater.versions)
    // 1.3.0 is the first release with the CLI in the repository. Before that
    // the installer wrote it, so there is nothing in history to run.
    const expected = tags.filter((tag) => {
      const [major, minor] = tag.split('.').map(Number)
      return major > 1 || (major === 1 && minor >= 3)
    })

    expect(covered).toEqual(expected)
  })

  it.skipIf(tags.length === 0)(
    'include both kinds: those that follow main and those that follow releases',
    () => {
      const versionsOf = (wanted: boolean) =>
        updaters
          .filter((updater) => followsReleases(updater) === wanted)
          .flatMap((updater) => updater.versions)

      // 2.0.8 is where `./ari update` started moving between releases.
      expect(versionsOf(false)).toContain('2.0.7')
      expect(versionsOf(false)).not.toContain('2.0.8')
      expect(versionsOf(true)).toContain('2.0.8')
    },
  )
})

describe.skipIf(cannotRun || updaters.length === 0)('updating from', { timeout: 180_000 }, () => {
  describe.each(updaters.map((updater) => [label(updater), updater] as const))(
    '%s',
    (_name, updater) => {
      let lab: UpgradeLab
      // One update of a fresh install, looked at from several sides below.
      let install: Install
      let update: RunResult

      beforeAll(() => {
        lab = createUpgradeLab(updater)
        install = lab.install()
        update = install.launcher(['update'], { input: 'y\n' })
      })
      afterAll(() => lab?.cleanup())

      it('runs the files that release shipped, byte for byte', () => {
        const untouched = lab.install()
        const real = (spec: string) =>
          execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', spec], {
            env: forSpawn(cleanEnv()),
            encoding: 'utf8',
          }).trim()

        expect(updater.files.length).toBeGreaterThan(0)
        for (const file of updater.files) {
          // Same object name means same content: git names objects by what is in them.
          expect(untouched.git('rev-parse', `HEAD:${file.path}`), file.path).toBe(
            real(`${lab.from}:${file.path}`),
          )
        }
      })

      it("brings the install onto today's code", () => {
        expect(update.status, update.out).toBe(0)
        expect(install.version()).toBe(NEXT_VERSION)
        // Updaters that know about releases stop at the release. Older ones
        // follow main, and end up one commit past it.
        expect(install.head()).toBe(followsReleases(updater) ? lab.nextCommit : lab.mainTip)
        expect(install.gitStatus('merge-base', '--is-ancestor', lab.nextCommit, 'HEAD')).toBe(0)
      })

      it('leaves a clean install on the main branch', () => {
        expect(install.git('status', '--porcelain')).toBe('')
        expect(install.git('symbolic-ref', '--short', 'HEAD')).toBe('main')
        expect(install.gitStatus('rev-parse', '-q', '--verify', 'MERGE_HEAD')).not.toBe(0)
      })

      it("hands over to today's updater, which then has nothing left to do", () => {
        const head = install.head()

        // --help is answered by today's updater; the old ones had no such option.
        const help = install.launcher(['update', '--help'])
        expect(help.status, help.out).toBe(0)
        expect(help.out).toContain('Usage: ./ari update [version] [--edge]')

        const again = install.launcher(['update'], { input: 'y\n' })
        expect(again.status, again.out).toBe(0)
        expect(again.out).toMatch(/Already up to date|You already have ARI 99\.0\.0/)
        expect(install.head()).toBe(head)
      })

      it("keeps the user's own commits", () => {
        const customised = lab.install()
        customised.write('my-notes.txt', 'mine\n')
        const mine = customised.commit('my own change')
        const res = customised.launcher(['update'], { input: 'y\n' })

        expect(res.status, res.out).toBe(0)
        expect(customised.gitStatus('merge-base', '--is-ancestor', mine, 'HEAD')).toBe(0)
        expect(customised.gitStatus('merge-base', '--is-ancestor', lab.nextCommit, 'HEAD')).toBe(0)
        expect(customised.version()).toBe(NEXT_VERSION)
        expect(customised.git('status', '--porcelain')).toBe('')
      })

      it('leaves the install alone when the answer is n', () => {
        const declined = lab.install()
        const res = declined.launcher(['update'], { input: 'n\n' })

        expect(res.status, res.out).toBe(0)
        expect(declined.head()).toBe(lab.fromCommit)
        expect(declined.version()).toBe(lab.from)
      })
    },
  )
})
