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
 * `signal` asks the process to stop. If it is not gone within `graceMs` it is
 * killed outright and the promise resolves anyway, so a stuck process can never
 * keep the caller from exiting. Resolves 'stopped' when it left on its own,
 * 'killed' after the forced kill, and 'already-exited' when there was nothing
 * left to wait for.
 */
export function stopChild(child, graceMs, signal = 'SIGTERM') {
  return new Promise((resolve) => {
    const exited = child.exitCode !== null || child.signalCode !== null
    const pending = new Set()
    let settled = false
    let timer = null
    const settle = (how) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      resolve(how)
    }
    const done = (what) => {
      pending.delete(what)
      if (pending.size === 0) settle('stopped')
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
      try {
        child.kill('SIGKILL')
      } catch {
        // Already gone.
      }
      settle('killed')
    }, graceMs)
    if (!exited) {
      try {
        child.kill(signal)
      } catch {
        // Exited between the check and the signal; the exit event settles it.
      }
    }
  })
}
