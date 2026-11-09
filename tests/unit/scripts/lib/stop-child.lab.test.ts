/**
 * stopChild: how `ari start` makes sure the dev server is really gone — its
 * process exited and nothing is left writing into its output pipe — before the
 * CLI itself exits. Real child processes, so a lab suite (see vitest.config.ts).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { stopChild } from '@/scripts/lib/stop-child.js'

const posix = process.platform === 'win32' ? describe.skip : describe

const run = (script: string) =>
  spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })

/** Collect stdout; resolve `up` once the child has printed its first line. */
const watch = (child: ChildProcess) => {
  let out = ''
  const up = new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()))
  child.stdout!.on('data', (chunk) => (out += chunk))
  child.stderr!.resume()
  return { up, out: () => out }
}

const exitOf = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) => child.once('exit', () => resolve()))

const IDLE = "console.log('up'); setInterval(() => {}, 1000)"

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
    // The child hands its stdout to a grandchild and exits at once on SIGTERM;
    // the grandchild keeps writing for a while and then prints a last line.
    const grandchild =
      "let n = 0; const t = setInterval(() => { console.log('tick ' + ++n); if (n === 5) { clearInterval(t); console.log('last') } }, 60)"
    const child = run(`
      const { spawn } = require('node:child_process')
      spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: ['ignore', 'inherit', 'inherit'] })
      process.on('SIGTERM', () => process.exit(0))
      ${IDLE}
    `)
    const { up, out } = watch(child)
    await up
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
    expect(await stopChild(child, 5000, 'SIGINT')).toBe('stopped')
    expect(child.exitCode).toBe(3)
  })
})
