import { spawnSync } from 'node:child_process'

const IS_WIN = process.platform === 'win32'

/** After a forced kill, how long to wait for the exit and the pipes to follow. */
const FORCED_SETTLE_MS = 1000

/**
 * Send `signal` to a spawned process. With `group: true` — the process was
 * spawned `detached`, so on POSIX it leads a process group of its own — the
 * signal goes to the whole group: the shell in front of a command, pnpm, next,
 * the server next forks. Windows has no signals; there `taskkill /T` ends the
 * whole tree, whatever the signal. Never throws: a process that is already
 * gone is the desired outcome.
 */
export function signalTree(child, signal, { group = false } = {}) {
  const exited = child.exitCode !== null || child.signalCode !== null
  if (IS_WIN) {
    // taskkill walks the tree from the root, so once the root is gone its
    // orphans are out of reach.
    if (!exited) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
    return
  }
  if (group) {
    // The group outlives its leader: pnpm may have left while the server it
    // started is still running, so this is tried even after the child exited.
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Nobody left in the group, or not a leader after all (not spawned detached).
    }
  }
  if (exited) return
  try {
    child.kill(signal)
  } catch {
    // Already gone.
  }
}

/** End a spawned process — and, with `group`, everything it started — at once. */
export function killTree(child, options) {
  signalTree(child, 'SIGKILL', options)
}

/**
 * Stop a spawned process and resolve once it is really gone.
 *
 * "Gone" means two things: the process has exited, and every pipe the caller
 * reads from it (stdout and stderr, when they were spawned as pipes) has
 * closed — which only happens when the last process holding the write end has
 * exited. The pipes matter when the child started children of its own that
 * share its output (pnpm → next → the dev server): a caller that exits while a
 * grandchild still writes turns each of its remaining log lines into an EPIPE
 * crash on that side.
 *
 * `signal` asks the process to stop (see signalTree for `group`). If it is not
 * gone within `graceMs`, it — with `group`, its whole process group — is killed
 * outright, and the promise resolves once that has taken effect, or after a
 * further moment if something outside the group still holds a pipe. So a stuck
 * process can never keep the caller from exiting. Resolves 'stopped' when it
 * left on its own, 'killed' after the forced kill, and 'already-exited' when
 * there was nothing left to wait for.
 */
export function stopChild(child, graceMs, { signal = 'SIGTERM', group = false } = {}) {
  return new Promise((resolve) => {
    const exited = child.exitCode !== null || child.signalCode !== null
    const pending = new Set()
    let settled = false
    let forced = false
    let timer = null
    const settle = (how) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      resolve(how)
    }
    const done = (what) => {
      pending.delete(what)
      if (pending.size === 0) settle(forced ? 'killed' : 'stopped')
    }

    if (!exited) {
      pending.add('exit')
      child.once('exit', () => done('exit'))
    }
    for (const stream of [child.stdout, child.stderr]) {
      if (!stream || stream.closed || stream.destroyed) continue
      pending.add(stream)
      stream.once('close', () => done(stream))
      // A pipe nobody reads never reaches its end, so it would never close.
      if (stream.readableFlowing !== true) stream.resume()
    }
    if (pending.size === 0) {
      settle(exited ? 'already-exited' : 'stopped')
      return
    }

    timer = setTimeout(() => {
      forced = true
      killTree(child, { group })
      timer = setTimeout(() => settle('killed'), FORCED_SETTLE_MS)
    }, graceMs)
    signalTree(child, signal, { group })
  })
}
