/**
 * Tests for lib/db/app-pool.ts — the lazily created pool for the
 * non-BYPASSRLS app role and its connection-level degrade state machine.
 *
 * createConfiguredPool (lib/db/pool.ts) and the app-role module are mocked;
 * app-connection is real so the derived config is asserted end to end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type FakePool = { end: ReturnType<typeof vi.fn>; id: number }

let created: Array<{ config: Record<string, unknown>; label: string | undefined; pool: FakePool }>
let createImpl: (config: Record<string, unknown>) => FakePool
type RoleStatus = { state: string; reason?: string; checkedAt?: number }
let roleState: {
  status: RoleStatus
  password: string | null
  ensureAppRole: ReturnType<typeof vi.fn<(opts?: unknown) => Promise<RoleStatus>>>
}
let warnSpy: ReturnType<typeof vi.spyOn>
const activityHolder = { events: [] as Array<Record<string, unknown>>, importFails: false }

function fakePool(): FakePool {
  return { end: vi.fn().mockResolvedValue(undefined), id: created.length + 1 }
}

beforeEach(() => {
  vi.resetModules()
  created = []
  createImpl = () => fakePool()
  roleState = {
    status: { state: 'ready' },
    password: 'app-pw',
    ensureAppRole: vi.fn(async () => roleState.status),
  }
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:pw@localhost:5432/ari')
  vi.stubEnv('ARI_DISABLE_APP_ROLE', '')
  vi.stubEnv('DATABASE_APP_POOL_MAX', '')
  vi.stubEnv('DATABASE_POOL_MAX', '')
  delete (globalThis as any).__ariPgAppPool
  activityHolder.events = []
  activityHolder.importFails = false
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  warnSpy.mockRestore()
  delete (globalThis as any).__ariPgAppPool
})

async function load() {
  vi.doMock('@/lib/db/pool', () => ({
    createConfiguredPool: vi.fn((config: Record<string, unknown>, label?: string) => {
      const pool = createImpl(config)
      created.push({ config, label, pool })
      return pool
    }),
    sslConfigFor: () => false,
  }))
  vi.doMock('@/lib/db/app-role', () => ({
    isAppRoleDisabled: () => {
      const v = (process.env.ARI_DISABLE_APP_ROLE ?? '').trim().toLowerCase()
      return v === '1' || v === 'true' || v === 'yes' || v === 'on'
    },
    getAppRoleStatus: () => ({ ...roleState.status }),
    getAppRolePassword: () => roleState.password,
    ensureAppRole: (opts?: unknown) => roleState.ensureAppRole(opts),
  }))
  vi.doMock('@/lib/activity-log', () => {
    if (activityHolder.importFails) throw new Error('activity log unavailable')
    return { logActivity: (e: Record<string, unknown>) => activityHolder.events.push(e) }
  })
  return await import('@/lib/db/app-pool')
}

/** Let the lazy activity-log import (a real async module load) and its .then() settle. */
const settle = () => new Promise((r) => setTimeout(r, 25))

// ── resolveAppPoolMax ──────────────────────────────────────────────────────

describe('resolveAppPoolMax', () => {
  it('prefers DATABASE_APP_POOL_MAX, then DATABASE_POOL_MAX, then the env default', async () => {
    const { resolveAppPoolMax } = await load()
    expect(resolveAppPoolMax({ DATABASE_APP_POOL_MAX: '7', DATABASE_POOL_MAX: '4' })).toBe(7)
    expect(resolveAppPoolMax({ DATABASE_POOL_MAX: '4' })).toBe(4)
    expect(resolveAppPoolMax({ NODE_ENV: 'production' })).toBe(3)
    expect(resolveAppPoolMax({ NODE_ENV: 'development' })).toBe(10)
    expect(resolveAppPoolMax({})).toBe(10)
  })

  it('guards against NaN and non-positive values (falls through to the next source)', async () => {
    const { resolveAppPoolMax } = await load()
    expect(resolveAppPoolMax({ DATABASE_APP_POOL_MAX: 'abc', DATABASE_POOL_MAX: '4' })).toBe(4)
    expect(
      resolveAppPoolMax({
        DATABASE_APP_POOL_MAX: '0',
        DATABASE_POOL_MAX: '-2',
        NODE_ENV: 'production',
      }),
    ).toBe(3)
    expect(resolveAppPoolMax({ DATABASE_APP_POOL_MAX: '  ', DATABASE_POOL_MAX: '' })).toBe(10)
    expect(resolveAppPoolMax({ DATABASE_APP_POOL_MAX: '12abc' })).toBe(12)
  })

  it('reads process.env by default', async () => {
    vi.stubEnv('DATABASE_APP_POOL_MAX', '5')
    const { resolveAppPoolMax } = await load()
    expect(resolveAppPoolMax()).toBe(5)
  })
})

// ── getAppPool ─────────────────────────────────────────────────────────────

describe('getAppPool', () => {
  it('builds the pool from the derived app-role config with the shared tuning factory', async () => {
    vi.stubEnv('DATABASE_APP_POOL_MAX', '4')
    const mod = await load()
    const pool = await mod.getAppPool()
    expect(pool).toBe(created[0].pool)
    expect(created).toHaveLength(1)
    expect(created[0].label).toBe('App Pool')
    expect(created[0].config).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'ari',
      user: 'ari_app',
      password: 'app-pw',
      ssl: false,
      max: 4,
    })
    expect(mod.getAppPoolState().mode).toBe('app')
    expect((globalThis as any).__ariPgAppPool).toBe(pool)
  })

  it('is cached: repeated and concurrent calls create one pool', async () => {
    const mod = await load()
    const [a, b] = await Promise.all([mod.getAppPool(), mod.getAppPool()])
    const c = await mod.getAppPool()
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(created).toHaveLength(1)
  })

  it('reuses a pool left on globalThis by a previous dev HMR cycle', async () => {
    const leftover = { end: vi.fn(), id: 99 }
    ;(globalThis as any).__ariPgAppPool = leftover
    const mod = await load()
    expect(await mod.getAppPool()).toBe(leftover)
    expect(created).toHaveLength(0)
  })

  it('does not store the pool on globalThis in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const mod = await load()
    await mod.getAppPool()
    expect((globalThis as any).__ariPgAppPool).toBeUndefined()
  })

  it('kill switch → null without touching the role or creating anything', async () => {
    vi.stubEnv('ARI_DISABLE_APP_ROLE', '1')
    const mod = await load()
    expect(await mod.getAppPool()).toBeNull()
    expect(roleState.ensureAppRole).not.toHaveBeenCalled()
    expect(created).toHaveLength(0)
    expect(mod.getAppPoolState().mode).toBe('disabled')
  })

  it('unsupported role → null, never snoozed, never retried', async () => {
    roleState.status = { state: 'unsupported', reason: 'no CREATEROLE' }
    const mod = await load()
    expect(await mod.getAppPool()).toBeNull()
    expect(await mod.getAppPool()).toBeNull()
    expect(created).toHaveLength(0)
    expect(mod.getAppPoolState()).toMatchObject({ mode: 'unsupported', degradedUntil: null })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('pending role (no boot ran) → runs the ensureAppRole fast path first', async () => {
    roleState.status = { state: 'pending' }
    roleState.ensureAppRole.mockImplementation(async () => {
      roleState.status = { state: 'ready' }
      return roleState.status
    })
    const mod = await load()
    expect(await mod.getAppPool()).toBe(created[0].pool)
    expect(roleState.ensureAppRole).toHaveBeenCalledTimes(1)
    expect(roleState.ensureAppRole).toHaveBeenCalledWith(undefined)
  })

  it('role provisioned but password unknown → null + 60s snooze with the reason, retried after', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'))
    roleState.status = { state: 'unavailable', reason: 'setup incomplete' }
    roleState.password = null
    const mod = await load()

    expect(await mod.getAppPool()).toBeNull()
    expect(mod.getAppPoolState()).toMatchObject({
      mode: 'fallback',
      degradedReason: 'setup incomplete',
      degradedUntil: Date.now() + mod.APP_POOL_SNOOZE_MS,
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('setup incomplete')

    // still snoozed → getAppPoolIfHealthy short-circuits, getAppPool would retry
    expect(await mod.getAppPoolIfHealthy()).toBeNull()

    // later the role becomes ready (e.g. bootstrap finished) — retried after the snooze
    roleState.status = { state: 'ready' }
    roleState.password = 'pw-now'
    vi.setSystemTime(new Date(Date.now() + mod.APP_POOL_SNOOZE_MS + 1))
    expect(await mod.getAppPoolIfHealthy()).toBe(created[0].pool)
    expect(created[0].config).toMatchObject({ password: 'pw-now' })
    expect(mod.getAppPoolState().mode).toBe('app')
  })

  it('a degraded role with a known password still gets a pool (the connect is the probe)', async () => {
    roleState.status = { state: 'degraded', reason: 'probe failed' }
    const mod = await load()
    expect(await mod.getAppPool()).toBe(created[0].pool)
  })

  it('missing DATABASE_URL → null + snooze', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const mod = await load()
    expect(await mod.getAppPool()).toBeNull()
    expect(mod.getAppPoolState().mode).toBe('fallback')
  })

  it('a throwing factory → null + snooze, never an exception', async () => {
    createImpl = () => {
      throw new Error('bad config')
    }
    const mod = await load()
    await expect(mod.getAppPool()).resolves.toBeNull()
    expect(mod.getAppPoolState()).toMatchObject({
      mode: 'fallback',
      degradedReason: expect.stringContaining('bad config'),
    })
  })
})

// ── degrade state machine ──────────────────────────────────────────────────

describe('noteAppPoolConnectFailure', () => {
  it('generic connect failure → snooze + fallback counted, pool kept, no repair', async () => {
    const mod = await load()
    const pool = await mod.getAppPool()
    mod.noteAppPoolConnectFailure(new Error('timeout exceeded when trying to connect'))
    expect(await mod.getAppPoolIfHealthy()).toBeNull()
    expect(mod.getAppPoolState()).toMatchObject({ mode: 'fallback', fallbackCount: 1 })
    expect(mod.getAppPoolState().degradedReason).toContain('timeout exceeded')
    expect((pool as unknown as FakePool).end).not.toHaveBeenCalled()
    expect(roleState.ensureAppRole).not.toHaveBeenCalled()
  })

  it.each(['28P01', '28000'])(
    '%s → drop the pool and repair the role in the background',
    async (code) => {
      const mod = await load()
      const pool = (await mod.getAppPool()) as unknown as FakePool
      let resolveForce!: (s: { state: string; checkedAt?: number }) => void
      roleState.ensureAppRole.mockImplementation(() => new Promise((r) => (resolveForce = r)))

      mod.noteAppPoolConnectFailure(Object.assign(new Error('auth failed'), { code }))

      expect(pool.end).toHaveBeenCalledTimes(1)
      expect(roleState.ensureAppRole).toHaveBeenCalledWith({ force: true })
      expect(await mod.getAppPoolIfHealthy()).toBeNull() // snoozed while the repair runs

      resolveForce({ state: 'ready', checkedAt: Date.now() })
      await Promise.resolve()
      await Promise.resolve()
      // repaired → snooze lifted, a fresh pool is built with the (new) password
      roleState.password = 'rotated'
      expect(await mod.getAppPoolIfHealthy()).toBe(created[1].pool)
      expect(created[1].config).toMatchObject({ password: 'rotated' })
    },
  )

  it('a rate-limited force (stale checkedAt) keeps the snooze instead of rebuilding a stale pool', async () => {
    const mod = await load()
    await mod.getAppPool()
    // ensureAppRole returns the PREVIOUS status (rate-limited): checked before this failure
    roleState.ensureAppRole.mockResolvedValue({ state: 'ready', checkedAt: Date.now() - 5_000 })
    mod.noteAppPoolConnectFailure(Object.assign(new Error('auth failed'), { code: '28P01' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(await mod.getAppPoolIfHealthy()).toBeNull()
    expect(mod.getAppPoolState().mode).toBe('fallback')
  })

  it('keeps the snooze when the repair does not end ready', async () => {
    const mod = await load()
    await mod.getAppPool()
    roleState.ensureAppRole.mockResolvedValue({ state: 'degraded', reason: 'still broken' })
    mod.noteAppPoolConnectFailure(Object.assign(new Error('auth failed'), { code: '28P01' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(await mod.getAppPoolIfHealthy()).toBeNull()
    expect(mod.getAppPoolState().mode).toBe('fallback')
  })

  it('warns once per snooze window, not once per failed call', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'))
    const mod = await load()
    await mod.getAppPool()
    mod.noteAppPoolConnectFailure(new Error('boom 1'))
    mod.noteAppPoolConnectFailure(new Error('boom 2'))
    mod.noteAppPoolConnectFailure(new Error('boom 3'))
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(mod.getAppPoolState().fallbackCount).toBe(3)
    vi.setSystemTime(new Date(Date.now() + mod.APP_POOL_SNOOZE_MS))
    mod.noteAppPoolConnectFailure(new Error('boom 4'))
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })
})

describe('counters', () => {
  it('noteFallback counts only while enforcement is expected', async () => {
    const mod = await load()
    mod.noteFallback()
    expect(mod.getAppPoolState().fallbackCount).toBe(1)
    vi.stubEnv('ARI_DISABLE_APP_ROLE', '1')
    mod.noteFallback()
    expect(mod.getAppPoolState().fallbackCount).toBe(1)
    vi.stubEnv('ARI_DISABLE_APP_ROLE', '')
    roleState.status = { state: 'unsupported' }
    mod.noteFallback()
    expect(mod.getAppPoolState().fallbackCount).toBe(1)
  })

  it('noteGrantMissRetry increments', async () => {
    const mod = await load()
    mod.noteGrantMissRetry()
    mod.noteGrantMissRetry()
    expect(mod.getAppPoolState().grantMissRetries).toBe(2)
  })
})

// ── lifecycle ──────────────────────────────────────────────────────────────

describe('resetAppPool / closeAppPool', () => {
  it('resetAppPool ends the old pool in the background and the next call builds a new one', async () => {
    const mod = await load()
    const first = (await mod.getAppPool()) as unknown as FakePool
    mod.resetAppPool()
    expect(first.end).toHaveBeenCalledTimes(1)
    expect((globalThis as any).__ariPgAppPool).toBeUndefined()
    const second = await mod.getAppPool()
    expect(second).not.toBe(first)
    expect(created).toHaveLength(2)
  })

  it('resetAppPool swallows an end() rejection and is a no-op without a pool', async () => {
    createImpl = () => ({ end: vi.fn().mockRejectedValue(new Error('already ended')), id: 1 })
    const mod = await load()
    mod.resetAppPool() // nothing yet
    await mod.getAppPool()
    expect(() => mod.resetAppPool()).not.toThrow()
    await Promise.resolve()
  })

  it('closeAppPool awaits end() and clears the pool', async () => {
    const mod = await load()
    const pool = (await mod.getAppPool()) as unknown as FakePool
    await mod.closeAppPool()
    expect(pool.end).toHaveBeenCalledTimes(1)
    expect(mod.getAppPoolState().mode).toBe('fallback') // attempted, no pool
    await expect(mod.closeAppPool()).resolves.toBeUndefined()
  })

  it('_resetAppPoolStateForTests returns to pending', async () => {
    const mod = await load()
    await mod.getAppPool()
    mod.noteGrantMissRetry()
    mod._resetAppPoolStateForTests()
    expect(mod.getAppPoolState()).toEqual({
      mode: 'pending',
      degradedUntil: null,
      degradedReason: null,
      fallbackCount: 0,
      grantMissRetries: 0,
      lastTransition: null,
    })
  })
})

// ── enforcement transitions → activity log ─────────────────────────────────

describe('enforcement transitions', () => {
  it('logs one fallback entry (attributed to the observing user) and then one restore', async () => {
    roleState.status = { state: 'unavailable', reason: 'setup incomplete' }
    roleState.password = null
    const mod = await load()
    await mod.getAppPool() // snoozes

    mod.noteFallback('user-a')
    mod.noteFallback('user-b') // same fallback episode — no second row
    await settle()
    expect(activityHolder.events).toHaveLength(1)
    expect(activityHolder.events[0]).toMatchObject({
      userId: 'user-a',
      type: 'rls_enforcement_fallback',
      source: 'system',
      metadata: { reason: 'setup incomplete' },
    })
    expect(mod.getAppPoolState().lastTransition).toMatchObject({
      type: 'fallback',
      reason: 'setup incomplete',
    })

    mod.noteAppPoolServed('user-c')
    mod.noteAppPoolServed('user-c') // already restored — no second row
    await settle()
    expect(activityHolder.events).toHaveLength(2)
    expect(activityHolder.events[1]).toMatchObject({
      userId: 'user-c',
      type: 'rls_enforcement_restored',
    })
    expect(mod.getAppPoolState().lastTransition).toMatchObject({ type: 'restored', reason: null })
  })

  it('a connect failure records the fallback with its reason', async () => {
    const mod = await load()
    await mod.getAppPool()
    mod.noteAppPoolConnectFailure(new Error('timeout exceeded'), 'user-a')
    mod.noteAppPoolConnectFailure(new Error('timeout exceeded'), 'user-a')
    await settle()
    expect(activityHolder.events).toHaveLength(1)
    expect((activityHolder.events[0].metadata as { reason: string }).reason).toContain(
      'timeout exceeded',
    )
  })

  it('records the transition even without an acting user, but writes no log row', async () => {
    const mod = await load()
    await mod.getAppPool()
    mod.noteAppPoolConnectFailure(new Error('boom'))
    await settle()
    expect(activityHolder.events).toHaveLength(0)
    expect(mod.getAppPoolState().lastTransition?.type).toBe('fallback')
  })

  it('does not count or log a fallback while enforcement is not expected', async () => {
    vi.stubEnv('ARI_DISABLE_APP_ROLE', '1')
    const mod = await load()
    mod.noteFallback('user-a')
    await settle()
    expect(activityHolder.events).toHaveLength(0)
    expect(mod.getAppPoolState().lastTransition).toBeNull()
    expect(mod.noteAppPoolServed('user-a')).toBeUndefined()
  })

  it('swallows an activity-log import failure', async () => {
    activityHolder.importFails = true
    roleState.status = { state: 'unavailable', reason: 'x' }
    roleState.password = null
    const mod = await load()
    await mod.getAppPool()
    expect(() => mod.noteFallback('user-a')).not.toThrow()
    await settle()
    expect(mod.getAppPoolState().lastTransition?.type).toBe('fallback')
  })
})

describe('getAppPoolState modes', () => {
  it('pending before any attempt', async () => {
    const mod = await load()
    expect(mod.getAppPoolState().mode).toBe('pending')
  })

  it('unavailable when the role reports unavailable and nothing is snoozed', async () => {
    roleState.status = { state: 'unavailable', reason: 'no secret' }
    roleState.password = null
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'))
    const mod = await load()
    await mod.getAppPool() // snoozes
    expect(mod.getAppPoolState().mode).toBe('fallback')
    vi.setSystemTime(new Date(Date.now() + mod.APP_POOL_SNOOZE_MS + 1))
    expect(mod.getAppPoolState().mode).toBe('unavailable')
  })
})
