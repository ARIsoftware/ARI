/**
 * stopChild: how `ari start` makes sure the dev server is really gone — its
 * process exited and nothing is left writing into its output pipe — before the
 * CLI itself exits, and how a stop reaches the whole process group (pnpm, next,
 * the server next forks) rather than only the shell in front of them. Real
 * child processes, so a lab suite (see vitest.config.ts).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { killTree, stopChild } from '@/scripts/lib/stop-child.js'

const posix = process.platform === 'win32' ? describe.skip : describe

const run = (script: string, options: { detached?: boolean } = {}) =>
  spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'], ...options })

/**
 * Collect stdout. `up` resolves once the child has printed its first line;
 * `until(text)` once the output contains `text`.
 */
const watch = (child: ChildProcess) => {
  let out = ''
  const waiters: Array<{ text: string; resolve: () => void }> = []
  child.stdout!.on('data', (chunk) => {
    out += chunk
    for (const w of waiters.splice(0)) {
      if (out.includes(w.text)) w.resolve()
      else waiters.push(w)
    }
  })
  child.stderr!.resume()
  const until = (text: string) =>
    new Promise<void>((resolve) => {
      if (out.includes(text)) resolve()
      else waiters.push({ text, resolve })
    })
  return { up: until('\n'), until, out: () => out }
}

const exitOf = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) => child.once('exit', () => resolve()))

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** A killed process can linger as a zombie until it is reaped; allow a moment. */
const gone = async (pid: number) => {
  for (let i = 0; i < 40 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50))
  return !alive(pid)
}

const IDLE = "console.log('up'); setInterval(() => {}, 1000)"

/**
 * A child that starts a grandchild sharing its stdout, prints the grandchild's
 * pid as its first line, and then idles. `onTerm` is what the child does on
 * SIGTERM; the grandchild runs `grandchild` and then announces itself ready,
 * so its handlers exist by then — a signal that lands before they do would
 * end it by default (installing the first one takes Node a moment).
 */
const family = (grandchild: string, onTerm: string) => `
  const { spawn } = require('node:child_process')
  const g = spawn(process.execPath, ['-e', ${JSON.stringify(`${grandchild}; console.log('grandchild: ready')`)}], { stdio: ['ignore', 'inherit', 'inherit'] })
  process.on('SIGTERM', () => { ${onTerm} })
  console.log('grandchild ' + g.pid)
  setInterval(() => {}, 1000)
`
const grandchildPid = (out: string) => Number(out.match(/^grandchild (\d+)/m)![1])
const GRANDCHILD_READY = 'grandchild: ready'

posix('stopChild', { timeout: 20_000 }, () => {
  it('resolves once a cooperative child has exited and its pipes have closed', async () => {
    const child = run(`process.on('SIGTERM', () => process.exit(0)); ${IDLE}`)
    const { up } = watch(child)
    await up
    expect(await stopChild(child, 5000)).toBe('stopped')
    expect(child.exitCode).toBe(0)
    expect(child.stdout!.closed).toBe(true)
    expect(child.stderr!.closed).toBe(true)
  })

  it('waits for a grandchild that still holds the output pipe after the child left', async () => {
    // The grandchild keeps writing for a while after the child has exited, then prints a last line.
    const child = run(
      family(
        "let n = 0; const t = setInterval(() => { console.log('tick ' + ++n); if (n === 5) { clearInterval(t); console.log('last') } }, 60)",
        'process.exit(0)',
      ),
    )
    const { until, out } = watch(child)
    await until(GRANDCHILD_READY)
    expect(await stopChild(child, 5000)).toBe('stopped')
    expect(child.exitCode).toBe(0)
    expect(out()).toContain('last') // resolved only after the grandchild's final line arrived
  })

  it('kills a child that ignores the signal once the grace period is over', async () => {
    const child = run(`process.on('SIGTERM', () => {}); ${IDLE}`)
    const { up } = watch(child)
    await up
    const started = Date.now()
    expect(await stopChild(child, 400)).toBe('killed')
    expect(Date.now() - started).toBeGreaterThanOrEqual(350)
    await exitOf(child)
    expect(child.signalCode).toBe('SIGKILL')
    expect(child.stdout!.closed).toBe(true) // the forced path waits for the exit and pipes too
  })

  it('resolves at once for a child that already exited', async () => {
    const child = run('process.exit(0)')
    watch(child)
    await new Promise<void>((resolve) => child.once('close', () => resolve()))
    expect(await stopChild(child, 5000)).toBe('already-exited')
  })

  it('sends the signal it is given', async () => {
    const child = run(
      `process.on('SIGINT', () => process.exit(3)); process.on('SIGTERM', () => {}); ${IDLE}`,
    )
    const { up } = watch(child)
    await up
    expect(await stopChild(child, 5000, { signal: 'SIGINT' })).toBe('stopped')
    expect(child.exitCode).toBe(3)
  })

  describe('with group: true (the child was spawned detached)', () => {
    it('the stop signal reaches the grandchild as well', async () => {
      const child = run(
        family(
          // Exit only once the farewell has reached the pipe: process.exit() drops a pending write.
          "process.on('SIGTERM', () => process.stdout.write('grandchild: bye\\n', () => process.exit(0))); setInterval(() => {}, 1000)",
          'process.exit(0)',
        ),
        { detached: true },
      )
      const { until, out } = watch(child)
      await until(GRANDCHILD_READY)
      try {
        expect(await stopChild(child, 5000, { group: true })).toBe('stopped')
        expect(out()).toContain('grandchild: bye')
        expect(await gone(grandchildPid(out()))).toBe(true)
      } finally {
        killTree(child, { group: true })
      }
    })

    it('the forced kill reaches a grandchild after the child itself has left', async () => {
      // pnpm's shape: the child exits on SIGTERM, the server it started lingers.
      const child = run(
        family("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)", 'process.exit(0)'),
        { detached: true },
      )
      const { until, out } = watch(child)
      await until(GRANDCHILD_READY)
      const pid = grandchildPid(out())
      try {
        expect(await stopChild(child, 400, { group: true })).toBe('killed')
        expect(child.exitCode).toBe(0) // the child left on request...
        expect(await gone(pid)).toBe(true) // ...and the grandchild was killed with the group
        expect(child.stdout!.closed).toBe(true)
      } finally {
        killTree(child, { group: true })
      }
    })

    it('the forced kill ends a grandchild that ignores the signal too', async () => {
      const child = run(
        family("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)", ''),
        { detached: true },
      )
      const { until, out } = watch(child)
      await until(GRANDCHILD_READY)
      const pid = grandchildPid(out())
      try {
        expect(alive(pid)).toBe(true)
        expect(await stopChild(child, 400, { group: true })).toBe('killed')
        expect(child.signalCode).toBe('SIGKILL')
        expect(await gone(pid)).toBe(true)
      } finally {
        killTree(child, { group: true })
      }
    })
  })
})
