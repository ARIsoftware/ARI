/**
 * Extra coverage for health-data/lib/retention.ts.
 *
 * Target: line 38 — the catch branch inside the sweep async function
 * when withAdminDb throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  withAdminDb: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  healthDataImports: {
    id: 'id',
    userId: 'userId',
    expiresAt: 'expiresAt',
    status: 'status',
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
    error: 'error',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn(() => ({ eq: true })),
  lt: vi.fn(() => ({ lt: true })),
  gt: vi.fn(() => ({ gt: true })),
  desc: vi.fn(() => ({ desc: true })),
  sql: Object.assign(vi.fn(() => 'now()'), { raw: vi.fn() }),
}))

import { withAdminDb } from '@/lib/db'
import { ensurePurgeSweeper } from '@/modules-core/health-data/lib/retention'

const mockWithAdminDb = vi.mocked(withAdminDb)

describe('ensurePurgeSweeper — sweep error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const key = Symbol.for('ari.health-data.purge-sweeper')
    delete (globalThis as Record<symbol, unknown>)[key]
  })

  afterEach(() => {
    const key = Symbol.for('ari.health-data.purge-sweeper')
    const timer = (globalThis as Record<symbol, unknown>)[key]
    if (timer && typeof (timer as NodeJS.Timeout).unref === 'function') {
      clearInterval(timer as NodeJS.Timeout)
    }
    delete (globalThis as Record<symbol, unknown>)[key]
    vi.clearAllMocks()
  })

  it('catches and logs errors from withAdminDb without throwing', async () => {
    // Make withAdminDb throw synchronously during the sweep
    mockWithAdminDb.mockRejectedValue(new Error('DB connection failed'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // ensurePurgeSweeper calls `void sweep()` which internally catches errors
    ensurePurgeSweeper()

    // Allow the microtask queue to flush so the async sweep() runs
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[health-data] Purge sweep failed:'),
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })
})
