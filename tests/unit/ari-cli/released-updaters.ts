/**
 * The updaters ARI has actually released, read from this repository's own
 * release tags, and a lab for running one of them against today's code.
 *
 * An update is carried out by the version that is already installed. So what
 * users experience when a new release comes out is decided by code that was
 * written earlier and cannot be changed any more. These helpers put that code
 * back on its feet: the files exactly as they were tagged, in an install built
 * the way installs of that release were built.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  cleanEnv,
  createWorkspace,
  forSpawn,
  REPO_ROOT,
  type Install,
  type Workspace,
} from './harness'

/**
 * Everything that takes part in an update, as tracked in a release: the
 * launcher scripts, the CLI and what it imports, and the git settings that
 * decide how those files are treated in a working tree.
 */
const UPDATER_PATHS = [
  'ari',
  'ari.cmd',
  '.ari/cli.js',
  '.gitignore',
  '.gitattributes',
  'scripts/reconcile-module-deps.js',
  'scripts/lib',
]

const RELEASE_RE = /^\d+\.\d+\.\d+$/

/** The version given to "today's code" in the lab: newer than any real release. */
export const NEXT_VERSION = '99.0.0'

export type ReleasedFile = {
  path: string
  mode: string
  content: Buffer
  /** git's object name for the content, when it came from a release. */
  sha?: string
}

export type ReleasedUpdater = {
  /** Releases that shipped exactly these files, oldest first. */
  versions: string[]
  /** `type` in that release's package.json ("module", or undefined for CommonJS). */
  packageType: string | undefined
  files: ReleasedFile[]
}

/** git in the real repository: read-only, and deaf to the caller's GIT_* variables. */
function repoGitRaw(args: string[]): Buffer {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], {
    env: forSpawn({ ...cleanEnv(), GIT_OPTIONAL_LOCKS: '0' }),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

const repoGit = (args: string[]) => repoGitRaw(args).toString('utf8')

const compareVersions = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
}

/** Release tags present in this checkout, oldest first. Empty when tags were not fetched. */
export function releaseTags(): string[] {
  try {
    return repoGit(['tag', '-l'])
      .split('\n')
      .map((tag) => tag.trim())
      .filter((tag) => RELEASE_RE.test(tag))
      .sort(compareVersions)
  } catch {
    return []
  }
}

function filesAt(tag: string): ReleasedFile[] {
  const listing = repoGit(['ls-tree', '-r', tag, '--', ...UPDATER_PATHS])
  return listing
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      // "<mode> blob <sha>\t<path>"
      const [meta, file] = line.split('\t')
      const [mode, , sha] = meta.split(' ')
      return { path: file, mode, sha }
    })
    .map(({ path: file, mode, sha }) => ({
      path: file,
      mode,
      content: repoGitRaw(['cat-file', 'blob', sha]),
      sha,
    }))
}

/**
 * Every distinct updater ever released. Releases whose updater files are
 * byte-for-byte the same are grouped: they behave the same, so one run covers
 * them all. Releases from before the CLI was kept in git are left out — their
 * CLI was written by the installer and is not in the history.
 */
export function releasedUpdaters(): ReleasedUpdater[] {
  const groups = new Map<string, ReleasedUpdater>()
  for (const tag of releaseTags()) {
    const files = filesAt(tag)
    if (!files.some((file) => file.path === '.ari/cli.js')) continue

    const pkg = JSON.parse(repoGit(['show', `${tag}:package.json`]))
    const packageType = typeof pkg.type === 'string' ? pkg.type : undefined
    const key = JSON.stringify([packageType, files.map((file) => [file.path, file.mode, file.sha])])

    const group = groups.get(key)
    if (group) group.versions.push(tag)
    else groups.set(key, { versions: [tag], packageType, files })
  }
  return [...groups.values()]
}

/** Today's updater files, from the working tree. */
function currentFiles(): ReleasedFile[] {
  const out: ReleasedFile[] = []
  const visit = (rel: string) => {
    const abs = path.join(REPO_ROOT, rel)
    if (!fs.existsSync(abs)) return
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) visit(path.posix.join(rel, name))
      return
    }
    out.push({
      path: rel,
      mode: stat.mode & 0o111 ? '100755' : '100644',
      content: fs.readFileSync(abs),
    })
  }
  for (const rel of UPDATER_PATHS) visit(rel)
  return out
}

function writeFiles(dir: string, files: ReleasedFile[]) {
  for (const file of files) {
    const target = path.join(dir, file.path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, file.content)
    fs.chmodSync(target, file.mode === '100755' ? 0o755 : 0o644)
  }
}

function removeFiles(dir: string, files: ReleasedFile[]) {
  for (const file of files) fs.rmSync(path.join(dir, file.path), { force: true })
}

function writePackage(dir: string, version: string, packageType: string | undefined) {
  const pkg: Record<string, unknown> = { name: 'ari-lab', version, private: true }
  if (packageType) pkg.type = packageType
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
}

export type UpgradeLab = {
  workspace: Workspace
  /** The old release the install starts on. */
  from: string
  /** Commit of the old release. */
  fromCommit: string
  /** Commit of the release carrying today's code, tagged NEXT_VERSION. */
  nextCommit: string
  /** Tip of upstream main: one unreleased commit past NEXT_VERSION. */
  mainTip: string
  /** A fresh install of the old release. */
  install: () => Install
  cleanup: () => void
}

/** Does this released updater know about release tags, or does it follow main? */
export function followsReleases(updater: ReleasedUpdater): boolean {
  const cli = updater.files.find((file) => file.path === '.ari/cli.js')
  return Boolean(cli && cli.content.includes('ls-remote'))
}

/**
 * An upstream whose history is: the old release, with its own updater files;
 * then a release carrying today's updater; then one unreleased commit.
 */
export function createUpgradeLab(updater: ReleasedUpdater): UpgradeLab {
  const workspace = createWorkspace()
  const { root, gitIn } = workspace
  const from = updater.versions[updater.versions.length - 1]

  const src = path.join(root, 'src')
  fs.mkdirSync(src)
  const git = gitIn(src)
  git('init', '-q', '-b', 'main')

  // The old release, as it was.
  writeFiles(src, updater.files)
  writePackage(src, from, updater.packageType)
  fs.writeFileSync(path.join(src, 'README.md'), 'ARI lab\n')
  git('add', '-A')
  git('commit', '-q', '-m', `Bump version to ${from}`)
  git('tag', '-a', from, '-m', `ARI ${from}`)
  const fromCommit = git('rev-parse', 'HEAD')

  // Today's code, released. Files the old release had and today's does not are
  // removed, as they were in the real history.
  removeFiles(src, updater.files)
  writeFiles(src, currentFiles())
  fs.writeFileSync(path.join(src, 'feature.txt'), 'new in the next release\n')
  git('add', '-A')
  git('commit', '-q', '-m', `Work for ${NEXT_VERSION}`)
  writePackage(src, NEXT_VERSION, 'module')
  git('commit', '-q', '-am', `Bump version to ${NEXT_VERSION}`)
  git('tag', '-a', NEXT_VERSION, '-m', `ARI ${NEXT_VERSION}`)
  const nextCommit = git('rev-parse', 'HEAD')

  fs.writeFileSync(path.join(src, 'unreleased.txt'), 'unreleased\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Unreleased work on main')
  const mainTip = git('rev-parse', 'HEAD')

  const upstream = path.join(root, 'upstream.git')
  gitIn(root)('clone', '-q', '--bare', src, upstream)

  let counter = 0
  return {
    workspace,
    from,
    fromCommit,
    nextCommit,
    mainTip,
    install: () => {
      const dir = path.join(root, `install-${++counter}`)
      // Installs of every release so far were made by cloning and then renaming
      // the remote; the result is the same as cloning into "upstream" directly.
      gitIn(root)('clone', '-q', '--origin', 'upstream', upstream, dir)
      gitIn(dir)('checkout', '-q', '-B', 'main', fromCommit)
      return workspace.installAt(dir)
    },
    cleanup: workspace.cleanup,
  }
}
