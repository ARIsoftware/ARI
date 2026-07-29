/**
 * Full coverage for lib/activity-log.ts: logActivity / logActivityOnce,
 * after()-scheduling with fire-and-forget fallback, error swallowing, and
 * the null-pool guard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── next/server mock: capture the callback after() schedules ───────────────
const afterHolder = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  throwOnCall: false,
}))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    if (afterHolder.throwOnCall) throw new Error('after() called outside a request scope')
    afterHolder.callbacks.push(cb)
  },
}))

// ── pool mock (swappable per test, incl. null) ─────────────────────────────
const poolHolder = vi.hoisted(() => ({
  pool: null as { query: ReturnType<typeof vi.fn> } | null,
}))
vi.mock('@/lib/db/pool', () => ({
  get pool() {
    return poolHolder.pool
  },
}))

import { logActivity, logActivityOnce } from '@/lib/activity-log'

const mockQuery = vi.fn()

/** Run every callback after() captured (simulates post-response execution). */
async function flushAfter() {
  const cbs = afterHolder.callbacks.splice(0)
  for (const cb of cbs) await cb()
}

beforeEach(() => {
  afterHolder.callbacks = []
  afterHolder.throwOnCall = false
  mockQuery.mockReset().mockResolvedValue({ rows: [] })
  poolHolder.pool = { query: mockQuery }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logActivity', () => {
  it('schedules the insert via after() and does not run it synchronously', () => {
    logActivity({ userId: 'u1', type: 'profile_updated', description: 'Updated profile' })
    expect(afterHolder.callbacks).toHaveLength(1)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('inserts with defaults: source settings, empty metadata', async () => {
    logActivity({ userId: 'u1', type: 'profile_updated', description: 'Updated profile' })
    await flushAfter()
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('INSERT INTO "activity_log"')
    expect(params).toEqual(['u1', 'profile_updated', 'settings', 'Updated profile', '{}'])
  })

  it('passes custom source and serializes metadata', async () => {
    logActivity({
      userId: 'u2',
      type: 'api_key_created',
      description: 'Generated API key "ci"',
      source: 'api',
      metadata: { label: 'ci', keyPrefix: 'ari_abc12345' },
    })
    await flushAfter()
    const [, params] = mockQuery.mock.calls[0]
    expect(params[2]).toBe('api')
    expect(JSON.parse(params[4])).toEqual({ label: 'ci', keyPrefix: 'ari_abc12345' })
  })

  it('swallows insert errors and logs them to console.error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockQuery.mockRejectedValue(new Error('db down'))
    logActivity({ userId: 'u1', type: 't', description: 'd' })
    await flushAfter()
    expect(consoleSpy).toHaveBeenCalledWith('Activity log write failed:', expect.any(Error))
  })

  it('falls back to fire-and-forget when after() throws (outside request scope)', async () => {
    afterHolder.throwOnCall = true
    logActivity({ userId: 'u1', type: 't', description: 'd' })
    // Not scheduled — ran directly as a floating promise
    expect(afterHolder.callbacks).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 0))
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when the pool is not initialized', async () => {
    poolHolder.pool = null
    logActivity({ userId: 'u1', type: 't', description: 'd' })
    await flushAfter()
    expect(mockQuery).not.toHaveBeenCalled()
  })
})

describe('logActivityOnce', () => {
  it('inserts with a NOT EXISTS dedupe guard on the metadata key', async () => {
    logActivityOnce(
      {
        userId: 'u1',
        type: 'api_key_expired',
        description: 'API key "ci" expired',
        metadata: { apiKeyId: 'key-1', label: 'ci' },
      },
      'apiKeyId',
    )
    await flushAfter()
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('WHERE NOT EXISTS')
    expect(params).toHaveLength(7)
    expect(params[1]).toBe('api_key_expired')
    expect(params[5]).toBe('apiKeyId')
    expect(params[6]).toBe('key-1')
  })

  it('drops the event when the dedupe key is missing from metadata', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logActivityOnce(
      { userId: 'u1', type: 't', description: 'd', metadata: { other: 'x' } },
      'apiKeyId',
    )
    expect(afterHolder.callbacks).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('apiKeyId'))
  })

  it('drops the event when the dedupe value is not a string', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logActivityOnce(
      { userId: 'u1', type: 't', description: 'd', metadata: { apiKeyId: 42 } },
      'apiKeyId',
    )
    expect(afterHolder.callbacks).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('drops the event when the dedupe value is an empty string', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logActivityOnce(
      { userId: 'u1', type: 't', description: 'd', metadata: { apiKeyId: '' } },
      'apiKeyId',
    )
    expect(afterHolder.callbacks).toHaveLength(0)
  })

  it('drops the event when metadata is absent entirely', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logActivityOnce({ userId: 'u1', type: 't', description: 'd' }, 'apiKeyId')
    expect(afterHolder.callbacks).toHaveLength(0)
  })

  it('is a no-op when the pool is not initialized', async () => {
    poolHolder.pool = null
    logActivityOnce(
      { userId: 'u1', type: 't', description: 'd', metadata: { apiKeyId: 'k' } },
      'apiKeyId',
    )
    await flushAfter()
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
