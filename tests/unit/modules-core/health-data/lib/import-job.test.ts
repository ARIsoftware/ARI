/**
 * Tests for health-data/lib/import-job.ts
 *
 * Mocks: @/lib/db (withUserContext), fs/promises (unlink),
 * ./parser (parseHealthExport). Tests the runImportJob orchestration logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  withUserContext: vi.fn(),
}))

vi.mock('@/lib/db/schema', () => ({
  healthDataImports: { id: 'id', userId: 'userId', status: 'status', updatedAt: 'updatedAt', exportDate: 'exportDate', locale: 'locale', profile: 'profile', clinical: 'clinical', error: 'error', progress: 'progress', phase: 'phase', recordsParsed: 'recordsParsed' },
  healthDataDailyMetrics: {},
  healthDataWorkouts: {},
  healthDataActivityDays: {},
  healthDataSleepNights: {},
  healthDataRoutes: {},
  healthDataEcgs: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ and: true })),
  eq: vi.fn(() => ({ eq: true })),
  sql: Object.assign(vi.fn(() => 'now()'), { raw: vi.fn() }),
}))

vi.mock('fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/modules-core/health-data/lib/parser', () => ({
  parseHealthExport: vi.fn(),
}))

// retention.ts imports withAdminDb which is separate from withUserContext
vi.mock('@/modules-core/health-data/lib/retention', () => ({
  STALE_PROCESSING_MS: 5 * 60 * 1000,
}))

import { withUserContext } from '@/lib/db'
import { unlink } from 'fs/promises'
import { parseHealthExport } from '@/modules-core/health-data/lib/parser'
import { runImportJob } from '@/modules-core/health-data/lib/import-job'

const mockWithUserContext = vi.mocked(withUserContext)
const mockUnlink = vi.mocked(unlink)
const mockParseHealthExport = vi.mocked(parseHealthExport)

const PARSED_DATA = {
  recordsParsed: 100,
  exportDate: '2024-01-01',
  locale: 'en_US',
  profile: { name: 'Test User' },
  clinical: {},
  dailyMetrics: [],
  workouts: [],
  activityDays: [],
  sleepNights: [],
  routes: [],
  ecgs: [],
}

function buildFakeDb(returnRows: unknown[] = [{ id: 'import-1' }]) {
  return {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => returnRows,
        }),
      }),
    }),
    insert: () => ({
      values: async () => [],
    }),
  }
}

describe('runImportJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the zip file even on success', async () => {
    mockParseHealthExport.mockResolvedValue(PARSED_DATA as never)
    mockWithUserContext.mockImplementation(async (_userId, fn) => fn(buildFakeDb() as never))

    await runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/test.zip')
  })

  it('deletes the zip file even on parse error', async () => {
    mockParseHealthExport.mockRejectedValue(new Error('Parse failed'))
    mockWithUserContext.mockImplementation(async (_userId, fn) => fn(buildFakeDb() as never))

    await runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/test.zip')
  })

  it('does not throw if unlink fails', async () => {
    mockParseHealthExport.mockResolvedValue(PARSED_DATA as never)
    mockWithUserContext.mockImplementation(async (_userId, fn) => fn(buildFakeDb() as never))
    mockUnlink.mockRejectedValue(new Error('File not found'))

    await expect(
      runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })
    ).resolves.not.toThrow()
  })

  it('calls updateImport with completed status on success', async () => {
    mockParseHealthExport.mockResolvedValue(PARSED_DATA as never)

    const updates: Record<string, unknown>[] = []
    mockWithUserContext.mockImplementation(async (_userId, fn) => {
      const fakeDb = {
        update: () => ({
          set: (vals: Record<string, unknown>) => {
            updates.push(vals)
            return {
              where: () => ({
                returning: async () => [{ id: 'imp-1' }],
              }),
            }
          },
        }),
        insert: () => ({
          values: async () => [],
        }),
      }
      return fn(fakeDb as never)
    })

    await runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })

    const completionUpdate = updates.find((u) => u.status === 'completed')
    expect(completionUpdate).toBeTruthy()
    expect(completionUpdate?.progress).toBe(100)
  })

  it('marks import as failed when parser throws a non-abort error', async () => {
    mockParseHealthExport.mockRejectedValue(new Error('XML parse error'))

    const updates: Record<string, unknown>[] = []
    mockWithUserContext.mockImplementation(async (_userId, fn) => {
      const fakeDb = {
        update: () => ({
          set: (vals: Record<string, unknown>) => {
            updates.push(vals)
            return {
              where: () => ({
                returning: async () => [{ id: 'imp-1' }],
              }),
            }
          },
        }),
        insert: () => ({
          values: async () => [],
        }),
      }
      return fn(fakeDb as never)
    })

    await runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })

    const failedUpdate = updates.find((u) => u.status === 'failed')
    expect(failedUpdate).toBeTruthy()
    expect(typeof failedUpdate?.error).toBe('string')
  })

  it('aborts quietly when the import row disappears (ImportAbortedError)', async () => {
    mockParseHealthExport.mockResolvedValue(PARSED_DATA as never)

    // updateImport returns empty rows → triggers ImportAbortedError
    mockWithUserContext.mockImplementation(async (_userId, fn) => {
      const fakeDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [], // row deleted — abort
            }),
          }),
        }),
        insert: () => ({
          values: async () => [],
        }),
      }
      return fn(fakeDb as never)
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })
    consoleSpy.mockRestore()
    // Should not throw, just log
  })

  it('handles error when marking failed status itself throws', async () => {
    mockParseHealthExport.mockRejectedValue(new Error('Parse failed'))
    let callCount = 0
    mockWithUserContext.mockImplementation(async (_userId, fn) => {
      callCount++
      if (callCount > 1) throw new Error('DB connection lost')
      return fn(buildFakeDb([{ id: 'imp-1' }]) as never)
    })

    // Should not propagate
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })
    ).resolves.not.toThrow()
    consoleSpy.mockRestore()
  })

  it('truncates long error messages to 300 chars', async () => {
    const longError = new Error('E'.repeat(500))
    mockParseHealthExport.mockRejectedValue(longError)

    const updates: Record<string, unknown>[] = []
    mockWithUserContext.mockImplementation(async (_userId, fn) => {
      const fakeDb = {
        update: () => ({
          set: (vals: Record<string, unknown>) => {
            updates.push(vals)
            return {
              where: () => ({
                returning: async () => [{ id: 'imp-1' }],
              }),
            }
          },
        }),
        insert: () => ({ values: async () => [] }),
      }
      return fn(fakeDb as never)
    })

    await runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })

    const failedUpdate = updates.find((u) => u.status === 'failed')
    expect((failedUpdate?.error as string).length).toBeLessThanOrEqual(300)
  })

  it('handles non-Error thrown objects in the catch block', async () => {
    mockParseHealthExport.mockRejectedValue('string-error')

    const updates: Record<string, unknown>[] = []
    mockWithUserContext.mockImplementation(async (_userId, fn) => {
      const fakeDb = {
        update: () => ({
          set: (vals: Record<string, unknown>) => {
            updates.push(vals)
            return {
              where: () => ({
                returning: async () => [{ id: 'imp-1' }],
              }),
            }
          },
        }),
        insert: () => ({ values: async () => [] }),
      }
      return fn(fakeDb as never)
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await runImportJob({ importId: 'imp-1', userId: 'user-1', zipPath: '/tmp/test.zip' })
    consoleSpy.mockRestore()

    const failedUpdate = updates.find((u) => u.status === 'failed')
    expect(failedUpdate?.error).toBe('Unknown error')
  })
})
