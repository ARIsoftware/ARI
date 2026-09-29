/**
 * The release check, run as it is run: the real script, as a child process, in
 * real git repositories. tests/unit/scripts/lib/release-tag.test.ts covers the
 * rules; this covers what the script reads out of git to apply them.
 *
 * A lab suite: slower than the rest, and left out of the test report that is
 * generated on every dev boot. See vitest.config.ts.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWorkspace, forSpawn, LAB_NODE, REPO_ROOT, type Workspace } from '../ari-cli/harness'

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-release-tag.mjs')
const posix = process.platform === 'win32' ? describe.skip : describe

posix('check-release-tag', { timeout: 120_000 }, () => {
  let workspace: Workspace
  let counter = 0

  beforeAll(() => {
    workspace = createWorkspace()
  })
  afterAll(() => workspace?.cleanup())

  /** A repository with one commit on main, ready to be released from. */
  const repository = () => {
    const dir = path.join(workspace.root, `repo-${++counter}`)
    fs.mkdirSync(dir)
    const git = workspace.gitIn(dir)
    git('init', '-q', '-b', 'main')
    const write = (file: string, content: string) => fs.writeFileSync(path.join(dir, file), content)
    write('package.json', JSON.stringify({ name: 'ari-lab', version: '2.0.10' }) + '\n')
    write('CHANGELOG.md', '# Changelog\n\n## 2.0.10\n\n- Earlier.\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'Bump version to 2.0.10')

    /** The release steps from the checklist, each of which can be left out. */
    const release = (
      version: string,
      opts: { changelog?: boolean; bump?: string | false; annotated?: boolean; tag?: string } = {},
    ) => {
      if (opts.changelog !== false) {
        write('CHANGELOG.md', `# Changelog\n\n## ${version}\n\n- New.\n\n## 2.0.10\n\n- Earlier.\n`)
        git('add', '-A')
        git('commit', '-q', '-m', `Work for ${version}`)
      }
      if (opts.bump !== false) {
        write(
          'package.json',
          JSON.stringify({ name: 'ari-lab', version: opts.bump ?? version }) + '\n',
        )
        git('commit', '-q', '-am', `Bump version to ${opts.bump ?? version}`)
      }
      const tag = opts.tag ?? version
      if (opts.annotated === false) git('tag', tag)
      else git('tag', '-a', tag, '-m', `ARI ${tag}`)
    }

    const check = (args: string[], env: Record<string, string | undefined> = {}) => {
      const merged: Record<string, string | undefined> = { ...workspace.env, ...env }
      // What CI sets for its own run must not reach a test that says otherwise.
      for (const key of ['GITHUB_REF_NAME', 'ARI_MAIN_REF']) {
        if (!(key in env) || env[key] === undefined) delete merged[key]
      }
      const res = spawnSync(LAB_NODE, [SCRIPT, ...args], {
        cwd: dir,
        env: forSpawn(merged),
        encoding: 'utf8',
      })
      return { status: res.status, out: (res.stdout ?? '') + (res.stderr ?? '') }
    }

    return { dir, git, write, release, check }
  }

  describe('a release made by the checklist', () => {
    it('passes', () => {
      const repo = repository()
      repo.release('2.0.11')
      const res = repo.check(['2.0.11'])

      expect(res.out).toContain('✔ 2.0.11 is a valid ARI release.')
      expect(res.status).toBe(0)
    })

    it('passes by hand before anything is pushed, against the local main', () => {
      const repo = repository()
      const upstream = path.join(workspace.root, `upstream-${counter}.git`)
      repo.git('clone', '-q', '--bare', repo.dir, upstream)
      repo.git('remote', 'add', 'upstream', upstream)
      repo.git('fetch', '-q', 'upstream')
      // The bump commit and the tag exist here only; upstream/main is behind.
      repo.release('2.0.11')

      expect(repo.check(['2.0.11']).status).toBe(0)
      expect(repo.check(['2.0.11', 'upstream/main']).status).toBe(1)
    })

    it('passes in CI, where the tag is compared with origin/main', () => {
      const repo = repository()
      repo.release('2.0.11')
      const origin = path.join(workspace.root, `origin-${counter}.git`)
      repo.git('clone', '-q', '--bare', repo.dir, origin)
      // What actions/checkout leaves for a tag push: the tag checked out, no
      // local main, and the branches as origin/*.
      const checkout = path.join(workspace.root, `checkout-${counter}`)
      workspace.gitIn(workspace.root)('clone', '-q', origin, checkout)
      const git = workspace.gitIn(checkout)
      git('checkout', '-q', '--detach', 'refs/tags/2.0.11')
      git('branch', '-q', '-D', 'main')

      const res = spawnSync(LAB_NODE, [SCRIPT, '2.0.11', 'origin/main'], {
        cwd: checkout,
        env: forSpawn(workspace.env),
        encoding: 'utf8',
      })
      expect(res.stdout + res.stderr).toContain('✔ 2.0.11 is a valid ARI release.')
      expect(res.status).toBe(0)
    })

    it('takes the tag from GITHUB_REF_NAME when none is given', () => {
      const repo = repository()
      repo.release('2.0.11')

      expect(repo.check([], { GITHUB_REF_NAME: '2.0.11' }).status).toBe(0)
    })

    it('takes the main ref from ARI_MAIN_REF when none is given', () => {
      const repo = repository()
      repo.release('2.0.11')
      repo.git('branch', 'elsewhere', 'HEAD~2')

      expect(repo.check(['2.0.11'], { ARI_MAIN_REF: 'main' }).status).toBe(0)
      expect(repo.check(['2.0.11'], { ARI_MAIN_REF: 'elsewhere' }).status).toBe(1)
    })
  })

  describe('a release with a step left out', () => {
    it.each([
      ['a lightweight tag', { annotated: false }, 'is lightweight'],
      [
        'no version bump',
        { bump: false as const },
        'package.json says 2.0.10 but the tag is 2.0.11',
      ],
      [
        'a bump to a different version',
        { bump: '2.0.12' },
        'package.json says 2.0.12 but the tag is 2.0.11',
      ],
      ['no changelog entry', { changelog: false }, 'no "## 2.0.11" entry'],
    ])('fails on %s', (_name, opts, message) => {
      const repo = repository()
      repo.release('2.0.11', opts)
      const res = repo.check(['2.0.11'])

      expect(res.status).toBe(1)
      expect(res.out).toContain('2.0.11 is not a valid ARI release')
      expect(res.out).toContain(message)
      expect(res.out).not.toContain('is a valid ARI release.')
    })

    it('fails when there is no changelog at all', () => {
      const repo = repository()
      repo.git('rm', '-q', 'CHANGELOG.md')
      repo.git('commit', '-q', '-m', 'no changelog')
      repo.release('2.0.11', { changelog: false })
      const res = repo.check(['2.0.11'])

      expect(res.status).toBe(1)
      expect(res.out).toContain('CHANGELOG.md is missing at the tagged commit.')
    })

    it('fails when package.json cannot be read', () => {
      const repo = repository()
      repo.release('2.0.11')
      repo.write('package.json', 'not json')
      repo.git('commit', '-q', '-am', 'broken package.json')
      repo.git('tag', '-a', '2.0.12', '-m', 'ARI 2.0.12')
      const res = repo.check(['2.0.12'])

      expect(res.status).toBe(1)
      expect(res.out).toContain('has no readable "version"')
    })

    it('fails on a tag that is not on main', () => {
      const repo = repository()
      repo.git('checkout', '-q', '-b', 'side')
      repo.release('2.0.11')
      repo.git('checkout', '-q', 'main')
      const res = repo.check(['2.0.11'])

      expect(res.status).toBe(1)
      expect(res.out).toContain('is not on main')
    })

    it('reads the files at the tagged commit, not the ones in the working tree', () => {
      const repo = repository()
      repo.release('2.0.11', { bump: false })
      // Putting things right afterwards does not make the tag right.
      repo.write('package.json', JSON.stringify({ name: 'ari-lab', version: '2.0.11' }) + '\n')
      repo.git('commit', '-q', '-am', 'Bump version to 2.0.11')
      const res = repo.check(['2.0.11'])

      expect(res.status).toBe(1)
      expect(res.out).toContain('package.json says 2.0.10 but the tag is 2.0.11')
    })

    it('lists everything that is wrong, not only the first thing', () => {
      const repo = repository()
      repo.git('checkout', '-q', '-b', 'side')
      // A commit that main does not have; without one the tag would sit on main.
      repo.write('side.txt', 'side\n')
      repo.git('add', '-A')
      repo.git('commit', '-q', '-m', 'work on a side branch')
      repo.release('2.0.11', { annotated: false, bump: false, changelog: false })
      repo.git('checkout', '-q', 'main')
      const res = repo.check(['2.0.11'])

      expect(res.status).toBe(1)
      const problems = res.out.split('\n').filter((line) => line.startsWith('  - '))
      expect(problems).toHaveLength(4)
      expect(res.out).toContain('package.json says 2.0.10 but the tag is 2.0.11')
      expect(res.out).toContain('is lightweight')
      expect(res.out).toContain('is not on main')
      expect(res.out).toContain('no "## 2.0.11" entry')
    })
  })

  describe('a tag that is not a release', () => {
    it.each([['v2.0.11'], ['2.0.11-beta.1'], ['2.0'], ['nightly']])('fails on %s', (tag) => {
      const repo = repository()
      repo.release('2.0.11', { tag })
      const res = repo.check([tag])

      expect(res.status).toBe(1)
      expect(res.out).toContain('is not a release number')
    })

    it('fails on a tag that does not exist', () => {
      const repo = repository()
      const res = repo.check(['2.0.11'])

      expect(res.status).toBe(1)
      expect(res.out).toContain('There is no tag named 2.0.11 in this repository.')
    })

    it('does not mistake a branch for a tag of the same name', () => {
      const repo = repository()
      repo.git('branch', '2.0.11')
      const res = repo.check(['2.0.11'])

      expect(res.status).toBe(1)
      expect(res.out).toContain('There is no tag named 2.0.11')
    })

    it('explains how to call it when it is given nothing to check', () => {
      const repo = repository()
      const res = repo.check([])

      expect(res.status).toBe(1)
      expect(res.out).toContain('Usage: node scripts/check-release-tag.mjs <tag> [main-ref]')
    })
  })
})
