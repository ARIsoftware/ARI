/**
 * End-to-end tests for `./ari update`: the real CLI, real git, throwaway repos.
 *
 * Every test makes its own install, so they are independent. What matters in
 * each is where the install ends up (its HEAD) and the exit code — the messages
 * are checked only where the wording is the behaviour.
 *
 * A lab suite: slower than the rest, and left out of the test report that is
 * generated on every dev boot. See vitest.config.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createLab, forSpawn, LAB_NODE, type Lab } from './harness'

// The lab stubs pnpm with a shell script and the CLI is exercised through
// POSIX pipes; Windows is covered by the unit tests of the decision logic.
const suite = process.platform === 'win32' ? describe.skip : describe

const YES = 'yes\n'
const ENTER = '\n'
const CLOSED = ''

suite('./ari update', { timeout: 120_000 }, () => {
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

  describe('the lab', () => {
    // The CLI and the launcher must run under the same Node, and it must be the
    // one asked for: a run meant to test an older Node that quietly used the
    // tests' own would prove nothing.
    it('runs the CLI and the launcher under the Node it was told to use', () => {
      const install = lab.install('2.0.8')
      const script = "console.log('node:' + process.version + ':' + process.execPath)"
      install.write('.ari/which-node.mjs', script)
      const direct = execFileSync(LAB_NODE, ['.ari/which-node.mjs'], {
        cwd: install.dir,
        env: forSpawn(lab.env),
        encoding: 'utf8',
      }).trim()
      const viaPath = execFileSync('/bin/sh', ['-c', 'node .ari/which-node.mjs'], {
        cwd: install.dir,
        env: forSpawn(lab.env),
        encoding: 'utf8',
      }).trim()

      expect(viaPath).toBe(direct)
      if (process.env.ARI_LAB_NODE) {
        expect(fs.realpathSync(direct.split(':').slice(2).join(':'))).toBe(
          fs.realpathSync(process.env.ARI_LAB_NODE),
        )
      }
    })
  })

  describe('choosing the release', () => {
    it('moves an install that is behind to the latest release, comparing versions as numbers', () => {
      const install = lab.install('2.0.8')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      // 2.0.10, not 2.0.9: as text "2.0.9" would sort last.
      expect(install.head()).toBe(lab.releases['2.0.10'])
      expect(install.version()).toBe('2.0.10')
      expect(res.out).toContain('ARI 2.0.8 → 2.0.10')
      expect(res.out).toContain('Update complete! Now on ARI 2.0.10.')
    })

    it('fast-forwards: an install without local commits gets no merge commit', () => {
      const install = lab.install('2.0.8')
      install.update([], { input: YES })

      expect(install.git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(2)
    })

    it('fast-forwards even when the user has merge.ff=false configured', () => {
      const install = lab.install('2.0.8')
      install.git('config', 'merge.ff', 'false')
      install.update([], { input: YES })

      expect(install.head()).toBe(lab.releases['2.0.10'])
    })

    it('moves to a release named by the user', () => {
      const install = lab.install('2.0.8')
      const res = install.update(['2.0.9'], { input: YES })

      expect(res.status).toBe(0)
      expect(install.head()).toBe(lab.releases['2.0.9'])
    })

    it('accepts a v prefix on the version', () => {
      const install = lab.install('2.0.8')
      install.update(['v2.0.9'], { input: YES })

      expect(install.head()).toBe(lab.releases['2.0.9'])
    })

    it('never picks a prerelease or a v-prefixed tag as the latest release', () => {
      const install = lab.install('2.0.10')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(install.head()).toBe(lab.releases['2.0.10'])
      expect(res.out).not.toContain('3.0.0')
      expect(res.out).not.toContain('9.9.9')
    })

    it('shows the compare link when the install sits exactly on a release, without needing local tags', () => {
      const install = lab.install('2.0.9')
      for (const tag of install.git('tag', '-l').split('\n')) install.git('tag', '-d', tag)
      const res = install.update([], { input: 'n\n' })

      expect(res.out).toContain('/compare/2.0.9...2.0.10')
    })

    it('leaves the compare link out when the install has commits past its release', () => {
      const install = lab.install('2.0.8')
      install.write('mine.txt', 'mine\n')
      install.commit('my local commit')
      const res = install.update([], { input: 'n\n' })

      expect(res.out).not.toContain('/compare/')
    })
  })

  describe('nothing to do', () => {
    it('reports an install on the latest release as up to date', () => {
      const install = lab.install('2.0.10')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain('ARI 2.0.10 is installed. Already up to date.')
      expect(install.head()).toBe(lab.releases['2.0.10'])
    })

    it('reports an install that followed main as ahead of the latest release', () => {
      const install = lab.install(lab.mainTip)
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain(
        'You already have ARI 2.0.10 plus 1 newer commit(s). No newer release yet.',
      )
      expect(install.head()).toBe(lab.mainTip)
    })

    it('does not claim "no newer release" for a release the user named', () => {
      const install = lab.install(lab.mainTip)
      const res = install.update(['2.0.10'], { input: YES })

      expect(res.out).toContain('You already have ARI 2.0.10 plus 1 newer commit(s).')
      expect(res.out).not.toContain('No newer release yet')
    })

    it('trusts history over a package.json that reports an older version', () => {
      const install = lab.install('2.0.10')
      install.write(
        'package.json',
        JSON.stringify({ name: 'x', version: '2.0.5', type: 'module' }) + '\n',
      )
      const edited = install.commit('version edited down')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain('You already have ARI 2.0.10')
      expect(install.head()).toBe(edited)
    })
  })

  describe('forward only', () => {
    it('refuses a release older than the installed one', () => {
      const install = lab.install('2.0.10')
      const res = install.update(['2.0.9'], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('ARI 2.0.9 is older than the installed 2.0.10.')
      expect(res.out).toContain('Downgrading is not supported')
      expect(install.head()).toBe(lab.releases['2.0.10'])
    })

    it('refuses it even when local history does not contain that release', () => {
      // A fork with its own version numbers: reports 3.0.0, never merged 2.0.9.
      const install = lab.install('2.0.8')
      install.write(
        'package.json',
        JSON.stringify({ name: 'x', version: '3.0.0', type: 'module' }) + '\n',
      )
      const fork = install.commit('fork: own version numbers')
      const res = install.update(['2.0.9'], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('Downgrading is not supported')
      expect(install.head()).toBe(fork)
    })

    it('refuses before downloading anything', () => {
      const own = ownLab()
      // The release must be one the install does not have yet, or there would
      // be nothing to download whichever order the checks ran in.
      const install = own.install('2.0.10')
      const published = own.publish('2.0.14')
      install.write(
        'package.json',
        JSON.stringify({ name: 'x', version: '2.0.20', type: 'module' }) + '\n',
      )
      const head = install.commit('reports a newer version')
      expect(install.gitStatus('cat-file', '-e', published)).not.toBe(0)

      const res = install.update(['2.0.14'], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('Downgrading is not supported')
      expect(res.out).not.toContain('Downloading')
      expect(install.gitStatus('cat-file', '-e', published)).not.toBe(0)
      expect(install.head()).toBe(head)
    })
  })

  describe('when the installed version and history disagree', () => {
    const forkAt = (version: string) => {
      const install = lab.install('2.0.8')
      install.write('package.json', JSON.stringify({ name: 'x', version, type: 'module' }) + '\n')
      return { install, head: install.commit('own version') }
    }

    it('does not take Enter as a yes when the install reports a newer version', () => {
      const { install, head } = forkAt('3.0.0')
      const res = install.update([], { input: ENTER })

      expect(res.out).toContain('Your copy reports 3.0.0 but does not include ARI 2.0.10')
      expect(res.out).toContain('(y/N)')
      expect(install.head()).toBe(head)
    })

    it('does not take Enter as a yes when the installed version cannot be read', () => {
      const { install, head } = forkAt('2.1.0-custom')
      const res = install.update([], { input: ENTER })

      expect(res.out).toContain('is not a standard release number')
      expect(res.out).toContain('(y/N)')
      expect(install.head()).toBe(head)
    })

    it('reports an install newer than every release as having nothing to do', () => {
      const install = lab.install(lab.mainTip)
      install.write(
        'package.json',
        JSON.stringify({ name: 'x', version: '2.1.0', type: 'module' }) + '\n',
      )
      const head = install.commit('local bump')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain(
        'Installed ARI 2.1.0 is newer than the latest release 2.0.10. Nothing to do.',
      )
      expect(install.head()).toBe(head)
    })
  })

  describe('answering the merge prompt', () => {
    it.each([['y'], ['Y'], ['yes'], ['YES'], ['']])('merges on %j', (answer) => {
      const install = lab.install('2.0.8')
      install.update([], { input: answer + '\n' })

      expect(install.head()).toBe(lab.releases['2.0.10'])
    })

    it.each([
      ['n'],
      ['N'],
      ['no'],
      ['NO'],
      ['No'],
      ['nope'],
      ['nah'],
      ['q'],
      ['cancel'],
      ['yy'],
      ['  no  '],
      ['y n'],
    ])('does not merge on %j', (answer) => {
      const install = lab.install('2.0.8')
      const res = install.update([], { input: answer + '\n' })

      expect(res.status).toBe(0)
      expect(res.out).toContain('Update cancelled.')
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })

    it('stops with a failing exit code when there is nobody to answer', () => {
      const install = lab.install('2.0.8')
      const res = install.update([], { input: CLOSED })

      expect(res.status).toBe(1)
      expect(res.out).toContain('No interactive terminal to confirm on.')
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })
  })

  describe('several prompts answered through a pipe', () => {
    const dirty = () => {
      const install = lab.install('2.0.8')
      install.write('LICENSE', 'license\nmy edit\n')
      return install
    }

    it('uses one answer per prompt', () => {
      const install = dirty()
      const res = install.update([], { input: 'yes\nyes\n' })

      expect(res.status).toBe(0)
      expect(install.head()).toBe(lab.releases['2.0.10'])
    })

    it('lets the second answer cancel', () => {
      const install = dirty()
      install.update([], { input: 'yes\nno\n' })

      expect(install.head()).toBe(lab.releases['2.0.8'])
    })

    it('fails when the answers run out', () => {
      const install = dirty()
      const res = install.update([], { input: 'yes\n' })

      expect(res.status).toBe(1)
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })

    it.each([[''], ['n'], ['no'], ['ok'], ['sure'], ['nope']])(
      'does not continue past the uncommitted-changes warning on %j',
      (answer) => {
        const install = dirty()
        const res = install.update([], { input: answer + '\nyes\n' })

        expect(res.out).not.toContain('Merge these updates?')
        expect(install.head()).toBe(lab.releases['2.0.8'])
      },
    )
  })

  describe('the state of the install', () => {
    it('does not warn about untracked files such as custom modules', () => {
      const install = lab.install('2.0.8')
      install.write('modules-custom/mine/module.json', '{}\n')
      const res = install.update([], { input: YES })

      expect(res.out).not.toContain('uncommitted change')
      expect(install.head()).toBe(lab.releases['2.0.10'])
    })

    it('warns on a detached HEAD and does not continue on Enter', () => {
      const install = lab.install('2.0.8')
      install.git('checkout', '-q', '--detach')
      const res = install.update([], { input: ENTER })

      expect(res.out).toContain('detached HEAD')
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })

    it('refuses a shallow clone and says how to fix it', () => {
      const install = lab.install('main', { shallow: true })
      const head = install.head()
      const res = install.update([], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('shallow clone')
      expect(res.out).toContain('git fetch --unshallow upstream')
      expect(install.head()).toBe(head)
    })

    it('refuses when the install shares no history with the release', () => {
      // A ZIP download later turned into a repository.
      const install = lab.install('2.0.8')
      install.git('checkout', '-q', '--orphan', 'fresh')
      install.commit('imported from a zip')
      install.git('branch', '-q', '-D', 'main')
      install.git('branch', '-q', '-m', 'main')
      const head = install.head()
      const res = install.update([], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('shares no history with ARI 2.0.10')
      expect(install.head()).toBe(head)
    })

    it('refuses when conflicts are left over from an earlier git operation', () => {
      const install = lab.install('2.0.8')
      install.write('LICENSE', 'license\nstashed edit\n')
      install.git('stash', '-q')
      install.write('LICENSE', 'license\ncommitted edit\n')
      const head = install.commit('local LICENSE edit')
      install.gitStatus('stash', 'pop')
      const res = install.update([], { input: 'yes\nyes\n' })

      expect(res.status).toBe(1)
      expect(res.out).toContain('unresolved conflicts from an earlier git operation')
      expect(res.out).toContain('LICENSE')
      expect(res.out).not.toContain('git merge --abort')
      expect(install.head()).toBe(head)
    })
  })

  describe('merging', () => {
    it('makes a merge commit with a readable message when there are local commits', () => {
      const install = lab.install('2.0.8')
      install.write('mine.txt', 'mine\n')
      install.commit('my local commit')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(install.git('log', '-1', '--format=%s')).toBe('Update ARI to 2.0.10')
      expect(install.git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3)
      expect(install.gitStatus('merge-base', '--is-ancestor', lab.releases['2.0.10'], 'HEAD')).toBe(
        0,
      )
    })

    it('stops on a conflict, names the file and says how to back out', () => {
      const install = lab.install('2.0.8')
      install.write('README.md', 'ARI lab\nmy conflicting edit\n')
      const head = install.commit('local README edit')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('Merge stopped: 1 file(s) conflict with your own changes.')
      expect(res.out).toContain('README.md')
      expect(res.out).toContain('git merge --abort')
      expect(install.head()).toBe(head)

      install.git('merge', '--abort')
      expect(install.git('status', '--porcelain', '--untracked-files=no')).toBe('')
    })

    it('refuses to start while that merge is unfinished', () => {
      const install = lab.install('2.0.8')
      install.write('README.md', 'ARI lab\nmy conflicting edit\n')
      install.commit('local README edit')
      install.update([], { input: YES })
      const res = install.update([], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('A previous merge is still in progress.')
    })

    it('reports a failure that is not a conflict as a failure, not as a conflict', () => {
      const install = lab.install('2.0.8')
      install.write('README.md', 'ARI lab\nuncommitted edit the update would overwrite\n')
      const res = install.update([], { input: 'yes\nyes\n' })

      expect(res.status).toBe(1)
      expect(res.out).toContain('Merge failed. See the message from git above.')
      expect(res.out).not.toContain('Merge stopped')
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })
  })

  describe('downloading', () => {
    it('downloads a release published after the install was made, without touching local tags', () => {
      const own = ownLab()
      const install = own.install('2.0.10')
      // A local tag of the same name pointing elsewhere, and the git setting
      // that makes a plain fetch fail on it.
      const published = own.publish('2.0.11')
      install.git('tag', '2.0.11', 'HEAD')
      install.git('config', 'remote.upstream.tagOpt', '--tags')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain('Downloading ARI 2.0.11')
      expect(res.out).not.toContain('rejected')
      expect(install.head()).toBe(published)
      expect(install.git('rev-parse', '2.0.11^{commit}')).toBe(own.releases['2.0.10'])
    })

    it('does not go to the network when the release is already present', () => {
      const install = lab.install('2.0.8')
      const res = install.update([], { input: 'n\n' })

      expect(res.out).not.toContain('Downloading')
    })

    it("fails with git's own error when upstream cannot be reached", () => {
      const install = lab.install('2.0.8')
      install.git('remote', 'set-url', 'upstream', lab.root + '/missing.git')
      const res = install.update([], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('Could not list releases from upstream.')
      expect(res.out).toContain('does not appear to be a git repository')
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })

    it('updates from a mirror to the newest release that mirror has', () => {
      const install = lab.install('2.0.8')
      install.git('remote', 'set-url', 'upstream', lab.staleMirror)
      const res = install.update([], { input: YES })

      expect(res.status).toBe(0)
      expect(install.head()).toBe(lab.releases['2.0.9'])
    })
  })

  describe('--edge', () => {
    it('moves to the tip of upstream main', () => {
      const install = lab.install('2.0.8')
      const res = install.update(['--edge'], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain('(unreleased)')
      expect(install.gitStatus('merge-base', '--is-ancestor', lab.mainTip, 'HEAD')).toBe(0)
    })

    it('reports up to date when there is nothing new on main', () => {
      const install = lab.install('2.0.8')
      install.update(['--edge'], { input: YES })
      const head = install.head()
      const res = install.update(['--edge'], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain('Already up to date with main.')
      expect(install.head()).toBe(head)
    })

    it('follows the remote branch even when a local branch and tag are both named upstream/main', () => {
      const install = lab.install('2.0.8')
      install.git('branch', 'upstream/main', lab.releases['2.0.8'])
      install.git('tag', 'upstream/main', lab.releases['2.0.9'])
      install.update(['--edge'], { input: YES })

      expect(install.gitStatus('merge-base', '--is-ancestor', lab.mainTip, 'HEAD')).toBe(0)
    })

    it('is not stopped by a conflicting local tag', () => {
      const install = lab.install('2.0.8')
      install.git('tag', '-d', '2.0.10')
      install.git('tag', '2.0.10', 'HEAD')
      install.git('config', 'remote.upstream.tagOpt', '--tags')
      const res = install.update(['--edge'], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).not.toContain('rejected')
    })

    it('says which branch it follows when upstream has no main', () => {
      const install = lab.install('2.0.8')
      const noMain = lab.root + '/no-main.git'
      install.git('clone', '-q', '--bare', lab.upstream, noMain)
      install.git('--git-dir', noMain, 'branch', '-m', 'main', 'trunk')
      install.git('remote', 'set-url', 'upstream', noMain)
      const res = install.update(['--edge'], { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain('Could not fetch the main branch from upstream.')
      expect(res.out).toContain('--edge follows the branch named main')
    })
  })

  describe('arguments', () => {
    it.each([
      [['9.9.9'], 'ARI 9.9.9 is not a released version.'],
      [['--force'], 'Unknown option: --force'],
      [['2.0'], 'Not a valid version: 2.0'],
      [['--edge', '2.0.10'], 'cannot be combined with a version'],
      [['2.0.9', '2.0.10'], 'Only one version can be given.'],
    ])('rejects %j', (args, message) => {
      const install = lab.install('2.0.8')
      const res = install.update(args, { input: YES })

      expect(res.status).toBe(1)
      expect(res.out).toContain(message)
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })

    it('lists the newer releases when the named version does not exist', () => {
      const install = lab.install('2.0.8')
      const res = install.update(['9.9.9'], { input: YES })

      expect(res.out).toMatch(/Newer releases: [\d., ]*2\.0\.10, 2\.0\.9/)
    })

    it('prints usage for --help and changes nothing', () => {
      const install = lab.install('2.0.8')
      const res = install.update(['--help'], { input: YES })

      expect(res.status).toBe(0)
      expect(res.out).toContain('Usage: ./ari update [version] [--edge]')
      expect(install.head()).toBe(lab.releases['2.0.8'])
    })
  })

  describe('environment', () => {
    it('says so when git cannot be started', () => {
      const install = lab.install('2.0.8')
      const res = install.update([], { input: YES, env: { PATH: lab.root + '/bin' } })

      expect(res.status).toBe(1)
      expect(res.out).toContain('git could not be started.')
    })
  })
})
