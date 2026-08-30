/**
 * Full coverage for lib/api-log-retention.ts — retention resolution, the
 * sampled prune gate, and the user-scoped delete.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const dbHolder = vi.hoisted(() => ({
  /** Queue of SELECT results, consumed in order. getRetentionDays issues up to
   *  two: the settings row, then the "has older history?" probe. */
  selectResults: [] as unknown[],
  /** Resolved value once a chain has gone through .delete() — Postgres returns
   *  a command result with rowCount, not a row array. */
  deleteResult: { rowCount: 0 } as unknown,
  calls: [] as string[],
  throwOn: null as string | null,
}))

vi.mock('@/lib/db', () => ({
  withAdminDb: vi.fn(async (op: (db: any) => Promise<unknown>) => op(makeDb())),
}))

vi.mock('@/lib/db/schema/core-schema', () => ({
  apiKeyUsageLogs: { id: 'id', userId: 'user_id', createdAt: 'created_at' },
  activityLog: { id: 'id', userId: 'user_id', createdAt: 'created_at' },
  moduleSettings: { userId: 'user_id', moduleId: 'module_id', settings: 'settings' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  lt: (a: unknown, b: unknown) => ({ lt: [a, b] }),
  sql: Object.assign((s: unknown) => ({ sql: s }), { raw: (s: unknown) => s }),
}))

vi.mock('@/lib/constants', () => ({ API_LOGGING_MODULE_ID: '__api_logging__' }))

/** Chainable thenable standing in for the Drizzle builder. */
function makeDb(): any {
  let isDelete = false
  const target: any = {
    select: rec('select'),
    from: rec('from'),
    where: rec('where'),
    limit: rec('limit'),
    delete: (...a: unknown[]) => {
      isDelete = true
      return rec('delete')(...a)
    },
    insert: rec('insert'),
    values: rec('values'),
    onConflictDoUpdate: rec('onConflictDoUpdate'),
    returning: rec('returning'),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      // Reject awaits only for throwOn values that don't name a chain method —
      // named ones (e.g. 'insert') throw synchronously in rec() so earlier
      // chains in the same call (the settings/history SELECTs) still resolve.
      if (dbHolder.throwOn && !(dbHolder.throwOn in target))
        return Promise.reject(new Error(dbHolder.throwOn)).then(res, rej)
      const value = isDelete ? dbHolder.deleteResult : (dbHolder.selectResults.shift() ?? [])
      return Promise.resolve(value).then(res, rej)
    },
  }
  function rec(name: string) {
    return (...args: unknown[]) => {
      dbHolder.calls.push(name)
      if (dbHolder.throwOn === name) throw new Error(dbHolder.throwOn)
      void args
      return target
    }
  }
  return target
}

import {
  DEFAULT_RETENTION_DAYS,
  PRUNE_SAMPLE_RATE,
  RETENTION_DAY_OPTIONS,
  getRetentionDays,
  pruneActivityLog,
  pruneUsageLogs,
  resolveRetentionDays,
  setRetentionDays,
  shouldPrune,
} from '@/lib/api-log-retention'

beforeEach(() => {
  dbHolder.selectResults = []
  dbHolder.deleteResult = { rowCount: 0 }
  dbHolder.calls = []
  dbHolder.throwOn = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('constants', () => {
  it('offers the documented windows and a 30-day default', () => {
    expect(RETENTION_DAY_OPTIONS).toEqual([30, 60, 90, 360])
    expect(DEFAULT_RETENTION_DAYS).toBe(30)
    expect(PRUNE_SAMPLE_RATE).toBe(200)
  })
})

describe('resolveRetentionDays', () => {
  it('defaults when there is no settings row at all', () => {
    expect(resolveRetentionDays(null)).toBe(30)
    expect(resolveRetentionDays(undefined)).toBe(30)
  })

  it('defaults when the row exists but has no retentionDays key', () => {
    expect(resolveRetentionDays({})).toBe(30)
    expect(resolveRetentionDays({ somethingElse: 1 })).toBe(30)
  })

  it('treats an explicit null as "never expire"', () => {
    expect(resolveRetentionDays({ retentionDays: null })).toBeNull()
  })

  it('returns a configured window', () => {
    expect(resolveRetentionDays({ retentionDays: 90 })).toBe(90)
  })

  it('coerces a numeric string', () => {
    expect(resolveRetentionDays({ retentionDays: '60' })).toBe(60)
  })

  it('floors a fractional value', () => {
    expect(resolveRetentionDays({ retentionDays: 45.9 })).toBe(45)
  })

  it('never deletes on an unreadable value', () => {
    // A garbage setting must fail safe to "keep everything", not to "delete".
    expect(resolveRetentionDays({ retentionDays: 'soon' })).toBeNull()
    expect(resolveRetentionDays({ retentionDays: 0 })).toBeNull()
    expect(resolveRetentionDays({ retentionDays: -5 })).toBeNull()
    expect(resolveRetentionDays({ retentionDays: Number.NaN })).toBeNull()
    expect(resolveRetentionDays({ retentionDays: Infinity })).toBeNull()
  })
})

describe('shouldPrune', () => {
  it('always prunes when the sample rate is 1 or lower', () => {
    expect(shouldPrune(1)).toBe(true)
    expect(shouldPrune(0)).toBe(true)
  })

  it('prunes on the zero bucket and skips otherwise', () => {
    const rand = vi.spyOn(Math, 'random')
    rand.mockReturnValue(0)
    expect(shouldPrune(200)).toBe(true)
    rand.mockReturnValue(0.5)
    expect(shouldPrune(200)).toBe(false)
    rand.mockReturnValue(0.999)
    expect(shouldPrune(200)).toBe(false)
  })

  it('uses the module default when no rate is given', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(shouldPrune()).toBe(true)
  })
})

describe('getRetentionDays', () => {
  it('reads an explicitly stored window', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: 90 } }]]
    expect(await getRetentionDays('user-1')).toBe(90)
    expect(dbHolder.calls).toContain('select')
    expect(dbHolder.calls).toContain('limit')
  })

  it('honours an explicit "never" without probing history', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: null } }]]
    expect(await getRetentionDays('user-1')).toBeNull()
    // one SELECT only — the history probe must not run
    expect(dbHolder.calls.filter((c) => c === 'select')).toHaveLength(1)
  })

  it('applies the default on a fresh install with no old history', async () => {
    // settings row absent, then both history probes come back empty
    dbHolder.selectResults = [[], [], []]
    expect(await getRetentionDays('user-1')).toBe(30)
  })

  it('persists the implicit decision so it cannot flip later', async () => {
    // Without persistence, the oldest row ageing past the shared 30-day cutoff
    // would flip an unconfigured user to "never" forever and the prune could
    // never run — the decision must be written back as an explicit choice.
    dbHolder.selectResults = [[], [], []]
    await getRetentionDays('user-1')
    expect(dbHolder.calls).toContain('insert')
    expect(dbHolder.calls).toContain('onConflictDoUpdate')
  })

  it('still returns the computed window when persisting the decision fails', async () => {
    dbHolder.selectResults = [[], [], []]
    dbHolder.throwOn = 'insert'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getRetentionDays('user-1')).toBe(30)
    expect(errSpy).toHaveBeenCalled()
  })

  it('grandfathers when the request log holds pre-existing history', async () => {
    // no settings row; usage-log probe hits, activity probe empty
    dbHolder.selectResults = [[], [{ id: 'old-row' }], []]
    // Must be null, not 30 — applying the default here would silently destroy
    // audit history the user never opted to delete.
    expect(await getRetentionDays('user-1')).toBeNull()
    // ...and the grandfathered "never" is pinned, not recomputed next time.
    expect(dbHolder.calls).toContain('insert')
  })

  it('grandfathers when only the activity log holds pre-existing history', async () => {
    // One setting governs both tables, so either one being old is enough.
    dbHolder.selectResults = [[], [], [{ id: 'old-activity' }]]
    expect(await getRetentionDays('user-1')).toBeNull()
  })

  it('treats a settings row lacking the key as no choice at all', async () => {
    dbHolder.selectResults = [[{ settings: {} }], [{ id: 'old-row' }], []]
    expect(await getRetentionDays('user-1')).toBeNull()
  })

  it('treats a row with a null settings blob as no choice at all', async () => {
    // A module_settings row can exist with settings NULL (created by some other
    // path); that is not a retention choice.
    dbHolder.selectResults = [[{ settings: null }], [], []]
    expect(await getRetentionDays('user-1')).toBe(30)
  })
})

describe('pruneUsageLogs', () => {
  it('deletes expired rows and reports the count from rowCount', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: 30 } }]]
    dbHolder.deleteResult = { rowCount: 2 }

    const deleted = await pruneUsageLogs('user-1')

    expect(deleted).toBe(2)
    expect(dbHolder.calls).toContain('delete')
    // The row ids are never materialised — counting must not use .returning().
    expect(dbHolder.calls).not.toContain('returning')
  })

  it('treats a null rowCount as zero', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: 30 } }]]
    dbHolder.deleteResult = { rowCount: null }
    expect(await pruneUsageLogs('user-1')).toBe(0)
  })

  it('does nothing when retention is disabled', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: null } }]]
    expect(await pruneUsageLogs('user-1')).toBe(0)
    expect(dbHolder.calls).not.toContain('delete')
  })

  it('swallows errors and reports zero', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dbHolder.throwOn = 'select'

    expect(await pruneUsageLogs('user-1')).toBe(0)
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to prune API key usage logs:',
      expect.any(Error)
    )
  })
})

describe('pruneActivityLog', () => {
  it('deletes expired activity rows under the shared setting', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: 30 } }]]
    dbHolder.deleteResult = { rowCount: 4 }

    expect(await pruneActivityLog('user-1')).toBe(4)
    expect(dbHolder.calls).toContain('delete')
  })

  it('does nothing when retention is disabled', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: null } }]]
    expect(await pruneActivityLog('user-1')).toBe(0)
    expect(dbHolder.calls).not.toContain('delete')
  })

  it('treats a null rowCount as zero', async () => {
    dbHolder.selectResults = [[{ settings: { retentionDays: 30 } }]]
    dbHolder.deleteResult = { rowCount: null }
    expect(await pruneActivityLog('user-1')).toBe(0)
  })

  it('swallows errors and reports zero', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dbHolder.throwOn = 'select'

    expect(await pruneActivityLog('user-1')).toBe(0)
    expect(errorSpy).toHaveBeenCalledWith('Failed to prune activity log:', expect.any(Error))
  })
})

describe('setRetentionDays', () => {
  it('upserts a window', async () => {
    await setRetentionDays('user-1', 60)
    expect(dbHolder.calls).toContain('insert')
    expect(dbHolder.calls).toContain('onConflictDoUpdate')
  })

  it('upserts null for "never"', async () => {
    await setRetentionDays('user-1', null)
    expect(dbHolder.calls).toContain('insert')
  })
})
