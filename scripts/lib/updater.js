/**
 * The `./ari update` command and the startup release check.
 *
 * Everything here takes its surroundings as arguments — the install's root,
 * how to ask a question, where to print, whether a person is present — and
 * returns an exit code instead of ending the process. That is what lets the
 * whole flow run under test against real git repositories
 * (tests/unit/scripts/lib/updater.lab.test.ts, tests/unit/ari-cli/update.lab.test.ts).
 * `.ari/cli.js` only wires it to the terminal.
 *
 * The rules themselves (which tags are releases, what a request means, what
 * counts as a yes) live in ./update-target.js.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  classifyUpdate,
  isNewerRelease,
  latestTag,
  parseRemoteTags,
  parseUpdateArgs,
  parseYesNo,
  resolveUpdateTarget,
  UPDATE_NEEDS_DELIBERATE_YES,
} from './update-target.js'

export const UPSTREAM_REPO = 'ARIsoftware/ARI'
export const UPSTREAM_URL = `https://github.com/${UPSTREAM_REPO}.git`
export const UPDATE_DOCS_URL = 'https://ari.software/docs/updating'

/** The remote-tracking branch `--edge` follows, by its full name: a local
 * branch or tag that happens to be called "upstream/main" would win over the
 * short one. */
export const EDGE_REF = 'refs/remotes/upstream/main'

export const DEFAULT_TIMEOUTS = {
  /** Listing releases, when nobody is there to press Ctrl+C. */
  lookupMs: 30_000,
  /** Downloading, when nobody is there to press Ctrl+C. */
  fetchMs: 10 * 60_000,
  /** The whole startup check. It must never hold up `./ari start`. */
  startupCheckMs: 3000,
}

// How long the startup check waits, once its time is up, for an answer that
// has already arrived but not been read yet.
const STARTUP_CHECK_GRACE_MS = 150

const USAGE = 'Usage: ./ari update [version] [--edge]'
const PREVIEW_MAX_COMMITS = 20
const FILE_LIST_MAX = 20
const GIT_ERROR_ABOVE =
  'See the message from git above. Check your network connection and the upstream remote: git remote get-url upstream'

const YELLOW = '\x1b[1;33m'
const GREEN = '\x1b[1;32m'
const RED = '\x1b[1;31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

/** Thrown to end the command; carries the exit code. Never escapes runUpdate(). */
class Exit extends Error {
  constructor(code) {
    super(`exit ${code}`)
    this.code = code
  }
}

/**
 * @typedef {{ status: number | null, stdout: string, stderr: string,
 *   failure: null | 'timeout' | 'missing' | 'error' }} GitResult
 *   status is null when git did not run to completion; `failure` says why.
 */

/**
 * git bound to an install, called with an argument array — no shell, so values
 * that came from the command line or from a remote (versions, shas) can never
 * be interpreted as syntax.
 *
 * @param {string} root
 * @param {Env} [env]
 * @returns {(args: string[], opts?: import('node:child_process').SpawnSyncOptions) => GitResult}
 */
export function createGit(root, env = process.env) {
  return (args, opts = {}) => {
    const res = spawnSync('git', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      windowsHide: true,
      ...opts,
    })
    let failure = null
    if (res.error) {
      const code = /** @type {NodeJS.ErrnoException} */ (res.error).code
      if (code === 'ETIMEDOUT') failure = 'timeout'
      else if (code === 'ENOENT') failure = 'missing'
      else failure = 'error'
    } else if (res.status === null) {
      failure = 'error' // ended by a signal
    }
    return {
      status: failure ? null : res.status,
      stdout: String(res.stdout || '').trim(),
      stderr: String(res.stderr || '').trim(),
      failure,
    }
  }
}

/** Version from the install's package.json, or null when it can't be read. */
export function readInstalledVersion(root) {
  try {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
    return typeof version === 'string' && version ? version : null
  } catch {
    return null
  }
}

/**
 * Is a person at the keyboard? With one, git may ask for credentials and can
 * take as long as it needs. Without one, nothing may wait for an answer.
 *
 * A terminal on stdin is the normal sign. Git Bash on Windows (mintty) is the
 * exception: it connects programs through pipes, so Node never sees a terminal
 * there even though someone is typing. mintty marks everything started from it
 * with TERM_PROGRAM=mintty, which is the sign used here.
 *
 * MSYSTEM is deliberately not enough: every program launched through Git's
 * bash has it, including CI steps, scheduled scripts and tools that run
 * commands with nobody watching.
 *
 * @param {{ stdinIsTTY: boolean, platform: string, env: Env }} input
 */
export function isAttended({ stdinIsTTY, platform, env }) {
  if (stdinIsTTY) return true
  if (env.CI) return false
  return platform === 'win32' && env.TERM_PROGRAM === 'mintty'
}

/**
 * Environment for git when nobody can answer a question: every way it could
 * stop and ask is switched off, so it fails instead of waiting.
 *
 * ssh is only put into batch mode when the user has not chosen their own ssh —
 * through GIT_SSH_COMMAND, GIT_SSH (plink, TortoiseGit) or core.sshCommand.
 * GIT_SSH_COMMAND outranks the other two, so setting it would replace the very
 * setup that lets them connect.
 *
 * @param {Env} env
 * @param {{ sshCommandConfigured: boolean }} opts
 * @returns {Env}
 */
export function unattendedGitEnv(env, { sshCommandConfigured }) {
  /** @type {Env} */
  const out = {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    SSH_ASKPASS_REQUIRE: 'never',
  }
  if (!env.GIT_SSH_COMMAND && !env.GIT_SSH && !sshCommandConfigured) {
    out.GIT_SSH_COMMAND = 'ssh -oBatchMode=yes'
  }
  return out
}

/**
 * Lines for a list of files, cut off after FILE_LIST_MAX with a count of the rest.
 * @param {string[]} files
 */
export function fileListLines(files) {
  const lines = files.slice(0, FILE_LIST_MAX).map((file) => '    ' + DIM + file + RESET)
  if (files.length > FILE_LIST_MAX) {
    lines.push('    ' + DIM + `... and ${files.length - FILE_LIST_MAX} more` + RESET)
  }
  return lines
}

const lines = (text) => text.split('\n').filter((line) => line.trim())

/**
 * @typedef {Record<string, string | undefined>} Env
 *
 * @typedef {object} UpdateOptions
 * @property {string[]} argv  Arguments after "update".
 * @property {string} root  The install.
 * @property {(question: string) => Promise<string | null>} ask  Resolves null when nobody answered.
 * @property {(line: string) => void} [log]
 * @property {Env} [env]
 * @property {boolean} [stdinIsTTY]
 * @property {string} [platform]
 * @property {{ lookupMs?: number, fetchMs?: number, startupCheckMs?: number }} [timeouts]
 * @property {() => boolean | Promise<boolean>} [afterMerge]  Installs dependencies; false means it failed.
 */

/**
 * Run `./ari update`.
 *
 * @param {UpdateOptions} options
 * @returns {Promise<number>} the exit code
 */
export async function runUpdate({
  argv,
  root,
  ask,
  log = console.log,
  env = process.env,
  stdinIsTTY = Boolean(process.stdin.isTTY),
  platform = process.platform,
  timeouts = {},
  afterMerge = () => true,
}) {
  const limits = { ...DEFAULT_TIMEOUTS, ...timeouts }
  const git = createGit(root, env)
  const attended = isAttended({ stdinIsTTY, platform, env })

  const fail = (message, hint) => {
    log('  ' + RED + '✘' + RESET + ' ' + message)
    if (hint) log('  ' + DIM + hint + RESET)
    log('')
    throw new Exit(1)
  }
  const done = (message) => {
    log('  ' + GREEN + '✔' + RESET + ' ' + message)
    log('')
    throw new Exit(0)
  }
  const cancel = () => {
    log('  ' + DIM + 'Update cancelled.' + RESET)
    log('')
    throw new Exit(0)
  }
  const printUsage = () => {
    log('  ' + USAGE)
    log('')
    log('    ./ari update           Update to the latest release')
    log('    ./ari update 2.0.5     Update to a specific newer release')
    log('    ./ari update --edge    Update to the latest unreleased code on main')
    log('')
  }

  // A yes/no prompt that needs a real answer: no terminal means we stop rather
  // than guess, and an unclear answer is never taken as a yes.
  const confirm = async (question, defaultValue) => {
    const answer = await ask(question)
    if (answer === null) {
      log('')
      fail('No interactive terminal to confirm on. Update cancelled.')
    }
    return parseYesNo(answer, defaultValue)
  }

  // git talking to the upstream remote. It runs with the user's own git
  // configuration and its messages shown, so a private mirror can authenticate
  // and a failure shows git's actual error.
  //
  // stdin is never handed to git: credential and passphrase questions go
  // through the terminal itself, and piped answers meant for our prompts must
  // not be consumed by a child. With nobody present, prompting is switched off
  // and a time limit applies — an unattended update fails instead of hanging.
  let unattendedEnv = null
  const gitUpstream = (args, { capture = false, timeout }) => {
    if (!attended && !unattendedEnv) {
      const sshCommandConfigured = git(['config', '--get', 'core.sshCommand']).status === 0
      unattendedEnv = unattendedGitEnv(env, { sshCommandConfigured })
    }
    const res = git(args, {
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
      ...(attended ? {} : { timeout, env: unattendedEnv }),
    })
    if (res.failure === 'timeout') {
      log(
        '  ' +
          DIM +
          `git did not finish within ${Math.round(timeout / 1000)}s and was stopped.` +
          RESET,
      )
    } else if (res.failure === 'missing') {
      log('  ' + DIM + 'git could not be started. Is it installed and on your PATH?' + RESET)
    } else if (res.failure) {
      log('  ' + DIM + 'git stopped unexpectedly.' + RESET)
    }
    return res
  }

  // Two histories with no commit in common can't be merged or compared — a ZIP
  // download later turned into a repository, for example. Say so up front
  // rather than letting the merge fail as if it were a conflict.
  const requireSharedHistory = (ref, what) => {
    const base = git(['merge-base', 'HEAD', ref])
    if (base.status === 0) return
    if (base.status === 1) {
      fail(
        `This copy of ARI shares no history with ${what}, so it cannot be updated in place.`,
        'This happens when ARI was not installed with git clone. Install a fresh copy and move your modules-custom/, themes-custom/ and .env.local across.',
      )
    }
    fail(
      `Could not compare your copy with ${what}.`,
      base.stderr.split('\n')[0] || 'Run ./ari doctor for details.',
    )
  }

  // Show what merging `ref` would bring in, without touching anything. Returns
  // the number of incoming commits; 0 means there is nothing to merge. Fails if
  // git can't tell us: the user must never be asked to confirm an update they
  // were not shown.
  const previewIncoming = (ref, heading) => {
    const commits = git(['log', '--oneline', 'HEAD..' + ref])
    if (commits.status !== 0) {
      fail(
        'Could not read the incoming changes.',
        commits.stderr.split('\n')[0] || 'Run ./ari doctor for details.',
      )
    }
    const incoming = lines(commits.stdout)
    if (incoming.length === 0) return 0
    // Three dots: what the update adds since the common ancestor. Two dots
    // would also list the user's own local commits, reversed, as if they'd be
    // removed.
    const diffStat = git(['diff', '--stat', 'HEAD...' + ref])
    if (diffStat.status !== 0) {
      fail(
        'Could not read the incoming changes.',
        diffStat.stderr.split('\n')[0] || 'Run ./ari doctor for details.',
      )
    }

    log('')
    log('  ' + heading(incoming.length))
    log('')
    for (const line of incoming.slice(0, PREVIEW_MAX_COMMITS)) log('    ' + DIM + line + RESET)
    if (incoming.length > PREVIEW_MAX_COMMITS) {
      log('    ' + DIM + `... and ${incoming.length - PREVIEW_MAX_COMMITS} more` + RESET)
    }
    log('')
    // Re-indent every line the same so the file column stays aligned.
    for (const line of lines(diffStat.stdout)) log('   ' + DIM + line.trim() + RESET)
    if (diffStat.stdout) log('')
    return incoming.length
  }

  // One place for how each kind of update is announced. A verdict missing here
  // is a programming error and stops the update rather than being mislabelled.
  const headings = {
    update: ({ version, current }, count) =>
      YELLOW +
      `ARI ${current || 'unknown'} → ${version}` +
      RESET +
      DIM +
      `  (${count} commit(s))` +
      RESET,
    'update-missing-commits': ({ version }, count) =>
      YELLOW +
      `Your copy reports ${version} but is missing ${count} commit(s) from that release:` +
      RESET,
    'update-version-mismatch': ({ version, current }, count) =>
      YELLOW +
      `Your copy reports ${current} but does not include ARI ${version} (${count} commit(s)):` +
      RESET,
    'update-unverified': ({ version, current }, count) =>
      YELLOW +
      `Your installed version (${current || 'missing'}) is not a standard release number, so ARI cannot confirm that ${version} is newer than what you have (${count} commit(s)):` +
      RESET,
  }

  // Resolve which release to move to and make sure its commit is available
  // locally. Never changes the working tree.
  const resolveReleaseTarget = (requested) => {
    log('  Looking up ARI releases...')
    const listed = gitUpstream(['ls-remote', '--tags', 'upstream'], {
      capture: true,
      timeout: limits.lookupMs,
    })
    if (listed.status !== 0) fail('Could not list releases from upstream.', GIT_ERROR_ABOVE)

    const current = readInstalledVersion(root)
    const tags = parseRemoteTags(listed.stdout)
    const resolved = resolveUpdateTarget({ currentVersion: current, requested, tags })

    if (resolved.kind === 'no-tags') {
      fail('No releases found upstream.', 'Use ./ari update --edge to follow main.')
    }
    if (resolved.kind === 'unknown-version') {
      fail(
        `ARI ${resolved.requested} is not a released version.`,
        resolved.newer.length > 0
          ? 'Newer releases: ' + resolved.newer.slice(0, 10).join(', ')
          : 'There is no release newer than the one installed.',
      )
    }

    const { version, sha } = resolved.target
    const wasRequested = requested !== null
    const hasCommit = () => git(['cat-file', '-e', sha + '^{commit}']).status === 0

    // Forward only. classifyUpdate() owns the rule; it is asked here first,
    // before any download, because a downgrade does not depend on history and
    // the real reason must not be hidden behind a network error.
    const early = classifyUpdate({
      relation: resolved.relation,
      requested: wasRequested,
      contained: false,
      ahead: 0,
    })
    if (early === 'downgrade') {
      log('  ' + RED + '✘' + RESET + ` ARI ${version} is older than the installed ${current}.`)
      log(
        '  ' +
          DIM +
          'Downgrading is not supported: the database schema only moves forward.' +
          RESET,
      )
      // A copy with its own version numbers reports "newer" without having the
      // release. Without a version, `./ari update` offers it the latest one —
      // say so, rather than leaving two commands that seem to disagree.
      if (hasCommit() && git(['merge-base', '--is-ancestor', sha, 'HEAD']).status === 1) {
        log(
          '  ' +
            DIM +
            `Your copy does not include ARI ${version}. If it uses its own version numbers, run ./ari update without a version to merge the latest release.` +
            RESET,
        )
      }
      log('')
      throw new Exit(1)
    }

    // Only go to the network when the release isn't here already. The fetch
    // takes the tag's objects into FETCH_HEAD; no local tag is written or
    // relied on (--no-tags also overrides a `remote.upstream.tagOpt=--tags`,
    // which would otherwise try to update local tags and report conflicts that
    // don't matter).
    if (!hasCommit()) {
      log(`  Downloading ARI ${version}...`)
      const fetched = gitUpstream(['fetch', '--no-tags', 'upstream', 'refs/tags/' + version], {
        timeout: limits.fetchMs,
      })
      if (!hasCommit()) {
        fail(
          `Could not download ARI ${version} from upstream.`,
          fetched.status === 0
            ? 'The download finished but the release is still missing. Run ./ari doctor for details.'
            : GIT_ERROR_ABOVE,
        )
      }
    }

    requireSharedHistory(sha, 'ARI ' + version)

    // History is the ground truth for what is installed; package.json only
    // shapes the wording. See classifyUpdate().
    const ancestry = git(['merge-base', '--is-ancestor', sha, 'HEAD']).status
    if (ancestry !== 0 && ancestry !== 1) {
      fail('Could not compare your copy with ARI ' + version + '.', 'Run ./ari doctor for details.')
    }
    const contained = ancestry === 0
    const ahead = contained ? Number(git(['rev-list', '--count', sha + '..HEAD']).stdout) || 0 : 0
    const verdict = classifyUpdate({
      relation: resolved.relation,
      requested: wasRequested,
      contained,
      ahead,
    })

    if (verdict === 'up-to-date') done(`ARI ${version} is installed. Already up to date.`)
    if (verdict === 'ahead') {
      done(
        `You already have ARI ${version} plus ${ahead} newer commit(s).` +
          (wasRequested ? '' : ' No newer release yet.'),
      )
    }
    if (verdict === 'installed-newer') {
      done(`Installed ARI ${current} is newer than the latest release ${version}. Nothing to do.`)
    }

    // The compare link is only accurate when the install sits exactly on a
    // release; otherwise it would show changes the user already has. Judged
    // from upstream's own tag list — local tags are not kept current by updates.
    const installedTag = tags.find((tag) => tag.version === current)
    const onRelease =
      Boolean(installedTag) && installedTag.sha === git(['rev-parse', 'HEAD']).stdout

    return {
      version,
      sha,
      current,
      verdict,
      compareFrom: verdict === 'update' && onRelease ? current : null,
    }
  }

  const previewRelease = (target) => {
    const heading = headings[target.verdict]
    if (!heading)
      fail(`Unexpected update state: ${target.verdict}.`, 'Run ./ari doctor for details.')

    const count = previewIncoming(target.sha, (n) => heading(target, n))
    if (count === 0) {
      // History said the release is not installed, yet there is nothing to bring in.
      fail(
        `Could not work out what ARI ${target.version} would change.`,
        'Run ./ari doctor for details.',
      )
    }
    const links = []
    if (target.compareFrom) {
      links.push(
        `https://github.com/${UPSTREAM_REPO}/compare/${target.compareFrom}...${target.version}`,
      )
    }
    // Release notes, when that release ships them.
    if (git(['cat-file', '-e', target.sha + ':CHANGELOG.md']).status === 0) {
      links.push(
        `What's new: https://github.com/${UPSTREAM_REPO}/blob/${target.version}/CHANGELOG.md`,
      )
    }
    for (const link of links) log('  ' + DIM + link + RESET)
    if (links.length > 0) log('')
  }

  const main = async () => {
    const args = parseUpdateArgs(argv)

    log('')
    if (args.error) {
      log('  ' + RED + '✘' + RESET + ' ' + args.error)
      log('')
      printUsage()
      throw new Exit(1)
    }
    if (args.help) {
      printUsage()
      throw new Exit(0)
    }

    log('  ' + YELLOW + 'Checking for ARI updates...' + RESET)
    log('')

    if (git(['--version']).status !== 0) {
      fail('git could not be started. Is it installed and on your PATH?')
    }
    if (git(['rev-parse', '--git-dir']).status !== 0) {
      fail(
        'This copy of ARI is not a git checkout, so it cannot be updated in place.',
        UPDATE_DOCS_URL,
      )
    }

    if (!lines(git(['remote']).stdout).includes('upstream')) {
      log('  Adding upstream remote...')
      if (git(['remote', 'add', 'upstream', UPSTREAM_URL]).status !== 0)
        fail('Failed to add upstream remote')
      log('  ' + GREEN + '✔' + RESET + ' Upstream remote added')
    } else {
      log('  ' + GREEN + '✔' + RESET + ' Upstream remote exists')
    }

    // A half-finished merge must be resolved first; merging on top of it fails
    // with a message that doesn't say why.
    if (git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0) {
      fail(
        'A previous merge is still in progress.',
        'Resolve the conflicts and run: git add <file> && git commit  (or cancel it with: git merge --abort)',
      )
    }

    // Conflicts left by something else (a stash pop, cherry-pick, rebase) leave
    // no MERGE_HEAD, but git refuses to merge on top of them — and afterwards
    // they would look like conflicts caused by the update.
    const alreadyUnmerged = lines(git(['diff', '--name-only', '--diff-filter=U']).stdout)
    if (alreadyUnmerged.length > 0) {
      log(
        '  ' +
          RED +
          '✘' +
          RESET +
          ` ${alreadyUnmerged.length} file(s) in your copy have unresolved conflicts from an earlier git operation:`,
      )
      for (const line of fileListLines(alreadyUnmerged)) log(line)
      fail('Resolve those first, then update again.', 'Run git status to see what each file needs.')
    }

    // A shallow clone has no complete history to compare or merge against: the
    // release would look "not installed" and the merge would fail as unrelated.
    if (git(['rev-parse', '--is-shallow-repository']).stdout === 'true') {
      fail(
        'This copy of ARI is a shallow clone, which cannot be updated in place.',
        'Download the full history once, then update again: git fetch --unshallow upstream',
      )
    }

    // Detached HEAD (e.g. after `git checkout 2.0.5`): the update would land on
    // no branch and be easy to lose.
    if (git(['symbolic-ref', '-q', 'HEAD']).status !== 0) {
      log('  ' + YELLOW + '⚠' + RESET + ' You are not on a branch (detached HEAD).')
      log(
        '  ' +
          DIM +
          'Updating here leaves the result on no branch. Switch first with: git switch main' +
          RESET,
      )
      if (!(await confirm('  Continue anyway? (y/N) ', false))) cancel()
      log('')
    }

    // Warn about uncommitted changes to tracked files. Untracked files are left
    // out: custom modules and themes are untracked by design, and git refuses
    // the merge by itself if one of them would be overwritten.
    const changed = lines(git(['status', '--porcelain', '--untracked-files=no']).stdout)
    if (changed.length > 0) {
      log('  ' + YELLOW + '⚠' + RESET + ` You have ${changed.length} uncommitted change(s).`)
      log('  ' + DIM + 'Consider committing or stashing before updating.' + RESET)
      if (!(await confirm('  Continue anyway? (y/N) ', false))) cancel()
      log('')
    }

    // What to merge, and the message a (non-fast-forward) merge commit gets.
    let mergeRef
    let mergeMessage
    // Pressing Enter accepts an ordinary update. It does not accept one where
    // the installed version and history disagree — that needs a deliberate yes.
    let enterMeansYes = true

    if (args.edge) {
      log('  Fetching upstream...')
      // Only the branch being followed, and no tags: a tag that differs locally
      // must not fail an update that doesn't use tags at all.
      const fetched = gitUpstream(
        ['fetch', '--no-tags', 'upstream', '+refs/heads/main:' + EDGE_REF],
        {
          timeout: limits.fetchMs,
        },
      )
      if (fetched.status !== 0) {
        fail(
          'Could not fetch the main branch from upstream.',
          'See the message from git above. --edge follows the branch named main; check your network connection and the remote: git remote get-url upstream',
        )
      }
      if (git(['rev-parse', '-q', '--verify', EDGE_REF + '^{commit}']).status !== 0) {
        fail(
          'The fetch finished but upstream main is still missing.',
          'Run ./ari doctor for details.',
        )
      }
      requireSharedHistory(EDGE_REF, 'upstream main')

      const incoming = previewIncoming(
        EDGE_REF,
        (count) =>
          YELLOW + `${count} new commit(s) on main ` + RESET + DIM + '(unreleased)' + RESET,
      )
      if (incoming === 0) done('Already up to date with main.')

      mergeRef = EDGE_REF
      mergeMessage = 'Update ARI to latest main'
    } else {
      const target = resolveReleaseTarget(args.version)
      previewRelease(target)
      // Merge the commit itself, not the tag name: a local tag can be missing,
      // stale, or point somewhere else, and upstream's sha is the authority.
      mergeRef = target.sha
      mergeMessage = 'Update ARI to ' + target.version
      enterMeansYes = !UPDATE_NEEDS_DELIBERATE_YES.has(target.verdict)
    }

    const question = '  Merge these updates? ' + (enterMeansYes ? '(Y/n) ' : '(y/N) ')
    if (!(await confirm(question, enterMeansYes))) cancel()

    // Merge. Fast-forward whenever history allows it — stated explicitly so a
    // user-level `merge.ff=false` can't turn every update into a merge commit.
    // Local commits make a real merge necessary; that commit gets a readable
    // message instead of git's default "Merge commit '<sha>'".
    log('')
    log('  Merging updates...')
    const canFastForward = git(['merge-base', '--is-ancestor', 'HEAD', mergeRef]).status === 0
    const mergeArgs = canFastForward
      ? ['merge', '--ff-only', mergeRef]
      : ['merge', '--no-edit', '-m', mergeMessage, mergeRef]
    // On a terminal git gets the terminal too: signing a merge commit (gpg) and
    // similar helpers look for it on stdin. Piped input stays ours.
    const merged = git(mergeArgs, {
      stdio: [stdinIsTTY ? 'inherit' : 'ignore', 'inherit', 'inherit'],
    })
    if (merged.status !== 0) {
      const conflicted = lines(git(['diff', '--name-only', '--diff-filter=U']).stdout)
      const unfinished = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0
      log('')
      // Only a merge that actually started (MERGE_HEAD) can have caused them,
      // and only then is there a merge to commit or abort.
      if (conflicted.length > 0 && unfinished) {
        log(
          '  ' +
            RED +
            '✘' +
            RESET +
            ` Merge stopped: ${conflicted.length} file(s) conflict with your own changes.`,
        )
        for (const line of fileListLines(conflicted)) log(line)
        log(
          '  ' +
            DIM +
            'Run git status to see what each file needs, resolve them, then run: git commit' +
            RESET,
        )
        log(
          '  ' + DIM + 'Or undo the update and keep your copy as it was: git merge --abort' + RESET,
        )
        log(
          '  ' +
            DIM +
            'Tip: keep customizations in modules-custom/ and themes-custom/ to avoid conflicts.' +
            RESET,
        )
      } else {
        log('  ' + RED + '✘' + RESET + ' Merge failed. See the message from git above.')
        if (unfinished) {
          log(
            '  ' +
              DIM +
              'The merge is prepared but not committed. Fix the problem and run: git commit' +
              RESET,
          )
          log('  ' + DIM + 'Or undo it with: git merge --abort' + RESET)
        }
      }
      log('')
      throw new Exit(1)
    }
    log('  ' + GREEN + '✔' + RESET + ' Code updated')

    if (!(await afterMerge())) throw new Exit(1)

    log('')
    const nowOn = readInstalledVersion(root)
    log(
      '  ' +
        GREEN +
        'Update complete!' +
        RESET +
        (nowOn ? ' Now on ARI ' + nowOn + '.' : '') +
        ' Run ' +
        DIM +
        './ari start' +
        RESET +
        ' to launch.',
    )
    log('')
    return 0
  }

  try {
    return await main()
  } catch (error) {
    if (error instanceof Exit) return error.code
    throw error
  }
}

/**
 * Best-effort release check for `./ari start`: resolves { latest, current }
 * when upstream has a newer release than the installed version, otherwise
 * null. Any failure is null so startup is never blocked or false-alarmed.
 *
 * The network call is started before this function returns. start() goes on
 * to do seconds of synchronous work, during which nothing queued on the event
 * loop runs; a lookup that was only started later would begin after that work
 * and lose to the timer. Started now, git runs alongside it. The one thing done
 * first is a single local `git config` read, a few milliseconds, to learn where
 * to ask and whether the user has their own ssh command.
 *
 * One timer covers the whole check and settles the promise itself rather than
 * waiting for git to exit — killing git does not always end its remote helper,
 * which can keep the pipe open.
 *
 * When the time is up the check does not give up on the spot. If the caller
 * kept the event loop busy past the limit, git's answer is sitting unread and
 * the expired timer is simply first in line; a short grace period lets the
 * answer be read before the check settles for nothing.
 *
 * It asks the same `upstream` remote `./ari update` lists releases from, so the
 * notice never advertises a release the update can't see. The official URL is
 * only the fallback for a checkout that has no upstream remote.
 *
 * @param {{ root: string, env?: Env, timeoutMs?: number, fallbackUrl?: string }} options
 * @returns {Promise<{ latest: string, current: string } | null>}
 */
export function checkForRelease({
  root,
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUTS.startupCheckMs,
  fallbackUrl = UPSTREAM_URL,
}) {
  return new Promise((resolve) => {
    const current = readInstalledVersion(root)
    if (!current) return resolve(null)
    // Not a git checkout → `./ari update` couldn't act on a notice anyway.
    if (!fs.existsSync(path.join(root, '.git'))) return resolve(null)

    const config = createGit(root, env)(
      ['config', '--get-regexp', '^(remote\\.upstream\\.url|core\\.sshcommand)$'],
      { timeout: 2000 },
    )
    if (config.failure) return resolve(null)
    const keys = lines(config.stdout).map((line) => line.split(/\s/)[0].toLowerCase())
    const source = keys.includes('remote.upstream.url') ? 'upstream' : fallbackUrl
    // This runs unattended in the background: it must never stop to ask.
    const quietEnv = unattendedGitEnv(env, {
      sshCommandConfigured: keys.includes('core.sshcommand'),
    })

    let settled = false
    let child = null
    let grace = null
    const settle = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(grace)
      resolve(value)
    }
    const timer = setTimeout(() => {
      grace = setTimeout(() => {
        settle(null)
        try {
          child?.kill()
        } catch {
          /* already gone */
        }
      }, STARTUP_CHECK_GRACE_MS)
    }, timeoutMs)

    try {
      child = spawn('git', ['-c', 'credential.helper=', 'ls-remote', '--tags', '--refs', source], {
        cwd: root,
        env: quietEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      })
    } catch {
      return settle(null)
    }

    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', () => settle(null))
    child.on('close', (code) => {
      if (code !== 0) return settle(null)
      const latest = latestTag(parseRemoteTags(out))
      settle(
        latest && isNewerRelease(latest.version, current)
          ? { latest: latest.version, current }
          : null,
      )
    })
  })
}
