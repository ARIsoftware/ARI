/**
 * Tests for health-data/lib/retention.ts
 *
 * Mocks: @/lib/db (withAdminDb), @/lib/db/schema (healthDataImports),
 * drizzle-orm query operators. The withRLS helper is passed directly.
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
import {
  RETENTION_MS,
  STALE_PROCESSING_MS,
  ensurePurgeSweeper,
  purgeExpiredImports,
  getCurrentImport,
  getCompletedImport,
  type WithRLS,
} from '@/modules-core/health-data/lib/retention'

const mockWithAdminDb = vi.mocked(withAdminDb)

// ─── Helper to build a fake withRLS ─────────────────────────────────────────

function makeWithRLS(returnRows: unknown[] = []) {
  let callCount = 0
  const returnValues: unknown[][] = []
  // Queue responses
  function queueResponse(rows: unknown[]) {
    returnValues.push(rows)
  }
  // By default, return returnRows for every call
  const withRLS = vi.fn(async (fn: (db: any) => Promise<unknown>) => {
    const rows = returnValues.length > callCount ? returnValues[callCount++] : returnRows
    callCount++
    const fakeDb = {
      delete: () => ({
        where: async () => rows,
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => rows,
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => rows,
          }),
        }),
      }),
    }
    return fn(fakeDb)
  }) as unknown as WithRLS
  return { withRLS, queueResponse }
}

// ─── Constants ───────────────────────────────────────────────────────────────

describe('retention constants', () => {
  it('RETENTION_MS is 1 hour', () => {
    expect(RETENTION_MS).toBe(60 * 60 * 1000)
  })

  it('STALE_PROCESSING_MS is 5 minutes', () => {
    expect(STALE_PROCESSING_MS).toBe(5 * 60 * 1000)
  })
})

// ─── ensurePurgeSweeper ──────────────────────────────────────────────────────

describe('ensurePurgeSweeper', () => {
  beforeEach(() => {
    // Clear the sweeper symbol so each test starts fresh
    const key = Symbol.for('ari.health-data.purge-sweeper')
    delete (globalThis as Record<symbol, unknown>)[key]
  })

  afterEach(() => {
    vi.clearAllMocks()
    const key = Symbol.for('ari.health-data.purge-sweeper')
    const timer = (globalThis as Record<symbol, unknown>)[key]
    if (timer && typeof (timer as NodeJS.Timeout).unref === 'function') {
      clearInterval(timer as NodeJS.Timeout)
    }
    delete (globalThis as Record<symbol, unknown>)[key]
  })

  it('calls withAdminDb to do an initial sweep', () => {
    mockWithAdminDb.mockImplementation(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = { delete: () => ({ where: async () => [] }) }
      return fn(fakeDb)
    })
    ensurePurgeSweeper()
    // withAdminDb is called once synchronously (void sweep())
    expect(mockWithAdminDb).toHaveBeenCalled()
  })

  it('is idempotent — second call does not create another interval', () => {
    mockWithAdminDb.mockImplementation(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = { delete: () => ({ where: async () => [] }) }
      return fn(fakeDb)
    })
    ensurePurgeSweeper()
    const callsAfterFirst = mockWithAdminDb.mock.calls.length
    ensurePurgeSweeper()
    // No additional calls should be made by the second ensurePurgeSweeper
    expect(mockWithAdminDb.mock.calls.length).toBe(callsAfterFirst)
  })

  it('stores the interval on globalThis under the expected symbol', () => {
    mockWithAdminDb.mockImplementation(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = { delete: () => ({ where: async () => [] }) }
      return fn(fakeDb)
    })
    ensurePurgeSweeper()
    const key = Symbol.for('ari.health-data.purge-sweeper')
    expect((globalThis as Record<symbol, unknown>)[key]).toBeTruthy()
  })
})

// ─── purgeExpiredImports ─────────────────────────────────────────────────────

describe('purgeExpiredImports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up sweeper to not interfere
    mockWithAdminDb.mockImplementation(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = { delete: () => ({ where: async () => [] }) }
      return fn(fakeDb)
    })
  })

  afterEach(() => {
    const key = Symbol.for('ari.health-data.purge-sweeper')
    const timer = (globalThis as Record<symbol, unknown>)[key]
    if (timer && typeof (timer as NodeJS.Timeout).unref === 'function') {
      clearInterval(timer as NodeJS.Timeout)
    }
    delete (globalThis as Record<symbol, unknown>)[key]
  })

  it('calls withRLS to delete expired rows', async () => {
    const { withRLS } = makeWithRLS([])
    await purgeExpiredImports(withRLS, 'user-1')
    expect(withRLS).toHaveBeenCalledOnce()
  })

  it('ensures sweeper is started', async () => {
    const { withRLS } = makeWithRLS([])
    await purgeExpiredImports(withRLS, 'user-1')
    const key = Symbol.for('ari.health-data.purge-sweeper')
    expect((globalThis as Record<symbol, unknown>)[key]).toBeTruthy()
  })
})

// ─── getCurrentImport ────────────────────────────────────────────────────────

describe('getCurrentImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithAdminDb.mockImplementation(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = { delete: () => ({ where: async () => [] }) }
      return fn(fakeDb)
    })
  })

  afterEach(() => {
    const key = Symbol.for('ari.health-data.purge-sweeper')
    const timer = (globalThis as Record<symbol, unknown>)[key]
    if (timer && typeof (timer as NodeJS.Timeout).unref === 'function') {
      clearInterval(timer as NodeJS.Timeout)
    }
    delete (globalThis as Record<symbol, unknown>)[key]
  })

  it('returns null when no rows exist', async () => {
    const { withRLS } = makeWithRLS([])
    const result = await getCurrentImport(withRLS, 'user-1')
    expect(result).toBeNull()
  })

  it('returns the row when status is completed and fresh', async () => {
    const row = {
      id: 'import-1',
      userId: 'user-1',
      status: 'completed',
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
    // call 0 = purge delete (empty), call 1 = select (returns row)
    const callQueue: unknown[][] = [[], [row]]
    let callIdx = 0
    const withRLS = vi.fn(async (fn: (db: any) => Promise<unknown>) => {
      const rows = callQueue[callIdx++] ?? []
      const fakeDb = {
        delete: () => ({ where: async () => [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => rows,
            }),
          }),
        }),
      }
      return fn(fakeDb)
    }) as unknown as WithRLS
    const result = await getCurrentImport(withRLS, 'user-1')
    expect(result).toMatchObject({ id: 'import-1', status: 'completed' })
  })

  it('marks a stale processing import as failed', async () => {
    const staleDate = new Date(Date.now() - STALE_PROCESSING_MS - 1000)
    const failedRow = {
      id: 'import-stale',
      userId: 'user-1',
      status: 'failed',
      updatedAt: new Date().toISOString(),
      error: 'The import was interrupted',
    }
    const processingRow = {
      id: 'import-stale',
      userId: 'user-1',
      status: 'processing',
      updatedAt: staleDate.toISOString(),
    }
    // call 0 = purge delete, call 1 = select (returns processingRow), call 2 = update returning (returns failedRow)
    const callQueue: unknown[][] = [[], [processingRow], [failedRow]]
    let callIdx = 0
    const withRLS = vi.fn(async (fn: (db: any) => Promise<unknown>) => {
      const rows = callQueue[callIdx++] ?? []
      const fakeDb = {
        delete: () => ({ where: async () => [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => rows,
            }),
          }),
        }),
      }
      return fn(fakeDb)
    }) as unknown as WithRLS
    const result = await getCurrentImport(withRLS, 'user-1')
    expect(result).toMatchObject({ status: 'failed' })
  })

  it('returns null when update returning is empty (row deleted mid-run)', async () => {
    const staleDate = new Date(Date.now() - STALE_PROCESSING_MS - 1000)
    const processingRow = {
      id: 'import-stale',
      userId: 'user-1',
      status: 'processing',
      updatedAt: staleDate.toISOString(),
    }
    // call 0 = purge delete, call 1 = select (processingRow), call 2 = update returning []
    const callQueue: unknown[][] = [[], [processingRow], []]
    let callIdx = 0
    const withRLS = vi.fn(async (fn: (db: any) => Promise<unknown>) => {
      const rows = callQueue[callIdx++] ?? []
      const fakeDb = {
        delete: () => ({ where: async () => [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => rows,
            }),
          }),
        }),
      }
      return fn(fakeDb)
    }) as unknown as WithRLS
    const result = await getCurrentImport(withRLS, 'user-1')
    expect(result).toBeNull()
  })

  it('does not mark fresh processing import as stale', async () => {
    const freshDate = new Date(Date.now() - 1000) // 1 second ago — well under STALE_PROCESSING_MS
    const processingRow = {
      id: 'import-fresh',
      userId: 'user-1',
      status: 'processing',
      updatedAt: freshDate.toISOString(),
    }
    // getCurrentImport: call 0 = purge delete, call 1 = select unexpired rows
    const callQueue: unknown[][] = [[], [processingRow]]
    let callIdx = 0
    const withRLS = vi.fn(async (fn: (db: any) => Promise<unknown>) => {
      const rows = callQueue[callIdx++] ?? []
      const fakeDb = {
        delete: () => ({ where: async () => [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => rows,
            }),
          }),
        }),
      }
      return fn(fakeDb)
    }) as unknown as WithRLS
    const result = await getCurrentImport(withRLS, 'user-1')
    expect(result).toMatchObject({ status: 'processing' })
  })
})

// ─── getCompletedImport ──────────────────────────────────────────────────────

describe('getCompletedImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithAdminDb.mockImplementation(async (fn: (db: any) => Promise<unknown>) => {
      const fakeDb = { delete: () => ({ where: async () => [] }) }
      return fn(fakeDb)
    })
  })

  afterEach(() => {
    const key = Symbol.for('ari.health-data.purge-sweeper')
    const timer = (globalThis as Record<symbol, unknown>)[key]
    if (timer && typeof (timer as NodeJS.Timeout).unref === 'function') {
      clearInterval(timer as NodeJS.Timeout)
    }
    delete (globalThis as Record<symbol, unknown>)[key]
  })

  it('returns null when no rows exist', async () => {
    const { withRLS } = makeWithRLS([])
    const result = await getCompletedImport(withRLS, 'user-1')
    expect(result).toBeNull()
  })

  it('returns null when row exists but status is not completed', async () => {
    // processing row is fresh (updatedAt = now), so won't be marked stale
    const processingRow = {
      id: 'import-1',
      status: 'processing',
      updatedAt: new Date().toISOString(),
    }
    // call 0 = purge delete, call 1 = select (returns processingRow)
    const callQueue: unknown[][] = [[], [processingRow]]
    let callIdx = 0
    const withRLS = vi.fn(async (fn: (db: any) => Promise<unknown>) => {
      const rows = callQueue[callIdx++] ?? []
      const fakeDb = {
        delete: () => ({ where: async () => [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => rows,
            }),
          }),
        }),
      }
      return fn(fakeDb)
    }) as unknown as WithRLS
    const result = await getCompletedImport(withRLS, 'user-1')
    expect(result).toBeNull()
  })

  it('returns the row when status is completed', async () => {
    const completedRow = {
      id: 'import-done',
      status: 'completed',
      updatedAt: new Date().toISOString(),
    }
    // call 0 = purge delete, call 1 = select (returns completedRow)
    const callQueue: unknown[][] = [[], [completedRow]]
    let callIdx = 0
    const withRLS = vi.fn(async (fn: (db: any) => Promise<unknown>) => {
      const rows = callQueue[callIdx++] ?? []
      const fakeDb = {
        delete: () => ({ where: async () => [] }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => rows,
              }),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => rows,
            }),
          }),
        }),
      }
      return fn(fakeDb)
    }) as unknown as WithRLS
    const result = await getCompletedImport(withRLS, 'user-1')
    expect(result).toMatchObject({ id: 'import-done', status: 'completed' })
  })
})
