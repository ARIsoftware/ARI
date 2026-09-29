/**
 * Test lab for the ARI CLI's update command.
 *
 * Runs the real `.ari/cli.js` as a child process against real git repositories
 * created in a temp directory: a bare "upstream" with tagged releases, and
 * throwaway installs cloned from it the way the installer clones ARI. Nothing
 * touches the network or the repository the tests run from.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

/** Files the CLI needs to run, copied into the lab's upstream repository. */
const CLI_FILES = ['.ari/cli.js', 'scripts/reconcile-module-deps.js', 'scripts/lib']

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

export type RunResult = {
  /** Exit code; null when the process was killed (e.g. by the timeout). */
  status: number | null
  /** stdout and stderr, colours stripped, lab paths replaced with <lab>. */
  out: string
}

export type Install = {
  dir: string
  git: (...args: string[]) => string
  /** git, returning the exit code instead of throwing. */
  gitStatus: (...args: string[]) => number
  head: () => string
  version: () => string
  write: (file: string, content: string) => void
  commit: (message: string) => string
  /** Run `./ari update ...args`, answering prompts with `input` (one line each). */
  update: (
    args?: string[],
    opts?: { input?: string; env?: Record<string, string | undefined> },
  ) => RunResult
  /** Run the install's own `./ari` launcher script with any arguments. */
  launcher: (
    args?: string[],
    opts?: { input?: string; env?: Record<string, string | undefined> },
  ) => RunResult
}

export type Lab = {
  root: string
  /** Environment every git and CLI call in the lab runs with. */
  env: Record<string, string | undefined>
  /**
   * Directory holding a `git` that behaves normally unless told otherwise:
   * ARI_FAKE_GIT_HANG=<subcommand> makes that subcommand hang for 12s,
   * ARI_FAKE_GIT_SLOW=<subcommand> makes it take a second longer, and
   * ARI_FAKE_GIT_ENVLOG=<file> records the prompt-related environment git was
   * given for network subcommands. Put it first on PATH to use it.
   */
  fakeGitDir: string
  /** Path of the bare upstream repository. */
  upstream: string
  /** Commit sha of each release, keyed by version. */
  releases: Record<string, string>
  /** Tip of upstream's main: one unreleased commit past the latest release. */
  mainTip: string
  /** A copy of upstream that is missing the newest release tag. */
  staleMirror: string
  /**
   * A fresh install positioned at a release version or a commit sha. With
   * `shallow`, a `--depth 1` clone of main instead (`at` is ignored).
   */
  install: (at: string, opts?: { shallow?: boolean }) => Install
  /** Publish a new release on upstream after installs were created. */
  publish: (version: string, opts?: { files?: Record<string, string> }) => string
  cleanup: () => void
}

/**
 * Variables that change what git does or where it acts. Whoever runs the tests
 * may have any of them set — a shell profile, a git hook, `git rebase -x` —
 * and GIT_DIR or GIT_INDEX_FILE would point the lab's git commands at the real
 * repository. None of them reaches the lab.
 */
const LEAKY = /^(GIT_|GCM_|SSH_ASKPASS|MSYSTEM$|TERM_PROGRAM$|CI$)/

/**
 * For code under test that runs git with the process's own environment (the
 * installer does): take every such variable out of process.env and put the
 * lab's in. Returns a function that puts everything back.
 */
export function useLabEnvironment(env: Record<string, string | undefined>): () => void {
  const saved = new Map<string, string | undefined>()
  const set = (key: string, value: string | undefined) => {
    if (!saved.has(key)) saved.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const key of Object.keys(process.env)) if (LEAKY.test(key)) set(key, undefined)
  for (const [key, value] of Object.entries(env)) if (LEAKY.test(key)) set(key, value)
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

export type LabEnv = Record<string, string | undefined>

/** Node's spawn functions take NodeJS.ProcessEnv, which Next widens to require NODE_ENV. */
export const forSpawn = (env: LabEnv) => env as NodeJS.ProcessEnv

/** The caller's environment with everything that could redirect git taken out. */
export function cleanEnv(): LabEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !LEAKY.test(key)))
}

/**
 * The Node that runs the CLI in the lab. The tests' own Node by default; set
 * ARI_LAB_NODE to the path of another `node` to run the CLI under that version
 * instead (the launcher finds it too: its folder is put first on PATH).
 */
export const LAB_NODE = process.env.ARI_LAB_NODE || process.execPath

function baseEnv(binDir: string): LabEnv {
  return {
    ...cleanEnv(),
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_SYSTEM: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'ARI Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'ARI Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
    GIT_TERMINAL_PROMPT: '0',
    PATH: [binDir, path.dirname(LAB_NODE), process.env.PATH ?? ''].join(path.delimiter),
  }
}

function copyInto(target: string) {
  for (const rel of CLI_FILES) {
    const from = path.join(REPO_ROOT, rel)
    const to = path.join(target, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.cpSync(from, to, { recursive: true })
  }
}

function setVersion(dir: string, version: string) {
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  pkg.version = version
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
}

export type Workspace = {
  root: string
  env: LabEnv
  /** git bound to a directory; throws when the command fails. */
  gitIn: (cwd: string) => (...args: string[]) => string
  /** An Install object for a directory that already holds a clone. */
  installAt: (dir: string) => Install
  cleanup: () => void
}

/** A temp directory with a stub pnpm on PATH and an environment sealed off from the caller's. */
export function createWorkspace(): Workspace {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ari-update-lab-')))
  const binDir = path.join(root, 'bin')
  fs.mkdirSync(binDir)
  // The update ends with `pnpm install`; a real one would hit the network.
  fs.writeFileSync(path.join(binDir, 'pnpm'), '#!/bin/sh\necho "[stub pnpm $*]"\n', { mode: 0o755 })
  const env = baseEnv(binDir)

  const gitIn =
    (cwd: string) =>
    (...args: string[]) =>
      execFileSync('git', args, {
        cwd,
        env: forSpawn(env),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()

  const run = (dir: string, command: string, args: string[], input: string, extra: LabEnv) => {
    const res = spawnSync(command, args, {
      cwd: dir,
      env: forSpawn({ ...env, ...extra }),
      encoding: 'utf8',
      // An empty input closes stdin straight away, as with `< /dev/null`.
      input,
      timeout: 90_000,
    })
    const out = ((res.stdout ?? '') + (res.stderr ?? ''))
      .replace(ANSI, '')
      .split(root)
      .join('<lab>')
    return { status: res.error ? null : res.status, out }
  }

  const installAt: Workspace['installAt'] = (dir) => {
    const git = gitIn(dir)
    return {
      dir,
      git,
      gitStatus: (...args) =>
        spawnSync('git', args, { cwd: dir, env: forSpawn(env), stdio: 'ignore' }).status ?? -1,
      head: () => git('rev-parse', 'HEAD'),
      version: () => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version,
      write: (file, content) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        fs.writeFileSync(path.join(dir, file), content)
      },
      commit: (message) => {
        git('add', '-A')
        git('commit', '-q', '-m', message)
        return git('rev-parse', 'HEAD')
      },
      update: (args = [], { input = '', env: extra = {} } = {}) =>
        run(dir, LAB_NODE, [path.join(dir, '.ari', 'cli.js'), 'update', ...args], input, extra),
      launcher: (args = [], { input = '', env: extra = {} } = {}) =>
        run(dir, path.join(dir, 'ari'), args, input, extra),
    }
  }

  return {
    root,
    env,
    gitIn,
    installAt,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

export function createLab(): Lab {
  const { root, env, gitIn, installAt, cleanup } = createWorkspace()

  const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], {
    env: forSpawn(env),
    encoding: 'utf8',
  }).trim()
  const fakeGitDir = path.join(root, 'fake-git')
  fs.mkdirSync(fakeGitDir)
  fs.writeFileSync(
    path.join(fakeGitDir, 'git'),
    [
      '#!/bin/sh',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    ls-remote|fetch)',
      '      if [ -n "$ARI_FAKE_GIT_ENVLOG" ]; then',
      '        echo "$arg prompt=${GIT_TERMINAL_PROMPT:-unset} gcm=${GCM_INTERACTIVE:-unset} ssh=${GIT_SSH_COMMAND:-unset} askpass=${SSH_ASKPASS_REQUIRE:-unset}" >> "$ARI_FAKE_GIT_ENVLOG"',
      '      fi',
      // Long enough to outlast any time limit under test, short enough that a
      // regression which loses the limit fails the test instead of stalling it.
      '      if [ "$ARI_FAKE_GIT_HANG" = "$arg" ]; then exec sleep 12; fi',
      // A slow network: the subcommand works, a second late.
      '      if [ "$ARI_FAKE_GIT_SLOW" = "$arg" ]; then sleep 1; fi',
      '      ;;',
      '  esac',
      'done',
      `exec "${realGit}" "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  // ── upstream: releases 2.0.8, 2.0.9, 2.0.10, then one unreleased commit ──
  const src = path.join(root, 'src')
  fs.mkdirSync(src)
  const srcGit = gitIn(src)
  srcGit('init', '-q', '-b', 'main')
  copyInto(src)
  fs.writeFileSync(
    path.join(src, 'package.json'),
    JSON.stringify({ name: 'ari-lab', version: '0.0.0', private: true, type: 'module' }, null, 2) +
      '\n',
  )
  fs.writeFileSync(path.join(src, 'README.md'), 'ARI lab\n')
  fs.writeFileSync(path.join(src, 'LICENSE'), 'license\n')

  const releases: Record<string, string> = {}
  const release = (version: string, feature: string) => {
    fs.writeFileSync(path.join(src, `feature-${feature}.txt`), feature + '\n')
    fs.appendFileSync(path.join(src, 'README.md'), `change for ${version}\n`)
    srcGit('add', '-A')
    srcGit('commit', '-q', '-m', `Work for ${version}`)
    setVersion(src, version)
    srcGit('commit', '-q', '-am', `Bump version to ${version}`)
    srcGit('tag', '-a', version, '-m', `ARI ${version}`)
    releases[version] = srcGit('rev-parse', 'HEAD')
  }
  release('2.0.8', 'a')
  release('2.0.9', 'b')
  release('2.0.10', 'c')
  // Tags that must never be picked as a release.
  srcGit('tag', 'v9.9.9')
  srcGit('tag', '-a', '3.0.0-beta.1', '-m', 'prerelease')
  fs.writeFileSync(path.join(src, 'unreleased.txt'), 'unreleased\n')
  srcGit('add', '-A')
  srcGit('commit', '-q', '-m', 'Unreleased work on main')
  const mainTip = srcGit('rev-parse', 'HEAD')

  const upstream = path.join(root, 'upstream.git')
  gitIn(root)('clone', '-q', '--bare', src, upstream)

  const staleMirror = path.join(root, 'stale.git')
  gitIn(root)('clone', '-q', '--bare', src, staleMirror)
  gitIn(staleMirror)('tag', '-d', '2.0.10')

  let counter = 0

  const install: Lab['install'] = (at, opts = {}) => {
    const dir = path.join(root, `install-${++counter}`)
    // Cloned the way the installer clones: in full, into a remote named upstream.
    const how = opts.shallow ? ['--depth', '1', 'file://' + upstream] : [upstream]
    gitIn(root)('clone', '-q', '--origin', 'upstream', ...how, dir)
    const git = gitIn(dir)
    if (!opts.shallow) git('checkout', '-q', '-B', 'main', releases[at] ?? at)

    return installAt(dir)
  }

  const publish: Lab['publish'] = (version, opts = {}) => {
    fs.writeFileSync(path.join(src, `feature-${version}.txt`), version + '\n')
    for (const [file, content] of Object.entries(opts.files ?? {})) {
      fs.writeFileSync(path.join(src, file), content)
    }
    srcGit('add', '-A')
    srcGit('commit', '-q', '-m', `Work for ${version}`)
    setVersion(src, version)
    srcGit('commit', '-q', '-am', `Bump version to ${version}`)
    srcGit('tag', '-a', version, '-m', `ARI ${version}`)
    releases[version] = srcGit('rev-parse', 'HEAD')
    srcGit('push', '-q', upstream, 'main', version)
    return releases[version]
  }

  return {
    root,
    env,
    fakeGitDir,
    upstream,
    releases,
    mainTip,
    staleMirror,
    install,
    publish,
    cleanup,
  }
}
