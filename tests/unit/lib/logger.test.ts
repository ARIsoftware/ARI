/**
 * Tests for lib/logger.ts
 *
 * The module reads process.env.NODE_ENV at module scope to determine if
 * running in production. We use vi.resetModules() + re-import to test
 * both production and development branches.
 *
 * logger.error   — always calls console.error regardless of env
 * logger.warn    — calls console.warn only in non-production
 * logger.info    — calls console.log only in non-production
 * logger.log     — alias for info; same behaviour
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── helpers ────────────────────────────────────────────────────────────────────

async function loadLoggerInEnv(nodeEnv: string) {
  vi.resetModules()
  const savedEnv = process.env.NODE_ENV
  ;(process.env as any).NODE_ENV = nodeEnv
  const mod = await import('@/lib/logger')
  ;(process.env as any).NODE_ENV = savedEnv
  return mod.logger
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── error (always on) ─────────────────────────────────────────────────────────

describe('logger.error', () => {
  it('calls console.error in development', async () => {
    const logger = await loadLoggerInEnv('development')
    logger.error('something broke', { extra: 1 })
    expect(console.error).toHaveBeenCalledWith('something broke', { extra: 1 })
  })

  it('calls console.error in production', async () => {
    const logger = await loadLoggerInEnv('production')
    logger.error('prod error', 42)
    expect(console.error).toHaveBeenCalledWith('prod error', 42)
  })

  it('calls console.error in test env', async () => {
    const logger = await loadLoggerInEnv('test')
    logger.error('test error')
    expect(console.error).toHaveBeenCalledWith('test error')
  })

  it('passes all additional arguments through', async () => {
    const logger = await loadLoggerInEnv('development')
    const err = new Error('oh no')
    logger.error('msg', err, 'extra', 3)
    expect(console.error).toHaveBeenCalledWith('msg', err, 'extra', 3)
  })
})

// ── warn (suppressed in production) ───────────────────────────────────────────

describe('logger.warn', () => {
  it('calls console.warn in development', async () => {
    const logger = await loadLoggerInEnv('development')
    logger.warn('warning msg', 'data')
    expect(console.warn).toHaveBeenCalledWith('warning msg', 'data')
  })

  it('does NOT call console.warn in production', async () => {
    const logger = await loadLoggerInEnv('production')
    logger.warn('suppressed warning')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('calls console.warn in test env (non-production)', async () => {
    const logger = await loadLoggerInEnv('test')
    logger.warn('test warning')
    expect(console.warn).toHaveBeenCalledWith('test warning')
  })

  it('passes extra args to console.warn', async () => {
    const logger = await loadLoggerInEnv('development')
    logger.warn('warn', 1, 2, 3)
    expect(console.warn).toHaveBeenCalledWith('warn', 1, 2, 3)
  })
})

// ── info (suppressed in production) ───────────────────────────────────────────

describe('logger.info', () => {
  it('calls console.log in development', async () => {
    const logger = await loadLoggerInEnv('development')
    logger.info('info message')
    expect(console.log).toHaveBeenCalledWith('info message')
  })

  it('does NOT call console.log in production', async () => {
    const logger = await loadLoggerInEnv('production')
    logger.info('suppressed info')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('calls console.log in test env', async () => {
    const logger = await loadLoggerInEnv('test')
    logger.info('test info', { key: 'val' })
    expect(console.log).toHaveBeenCalledWith('test info', { key: 'val' })
  })
})

// ── log (alias for info) ──────────────────────────────────────────────────────

describe('logger.log', () => {
  it('calls console.log in development', async () => {
    const logger = await loadLoggerInEnv('development')
    logger.log('log message', 99)
    expect(console.log).toHaveBeenCalledWith('log message', 99)
  })

  it('does NOT call console.log in production', async () => {
    const logger = await loadLoggerInEnv('production')
    logger.log('suppressed log')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('passes multiple extra args', async () => {
    const logger = await loadLoggerInEnv('test')
    logger.log('multi', 'a', 'b', 'c')
    expect(console.log).toHaveBeenCalledWith('multi', 'a', 'b', 'c')
  })
})
