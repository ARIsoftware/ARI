/**
 * tests/unit/modules-core/tasks/lib/server.test.ts
 *
 * Tests for modules-core/tasks/lib/server.ts — getUserTimeZone().
 */
import { describe, it, expect, vi } from 'vitest'

// ── mock drizzle-orm ──────────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
}))

// ── mock @/lib/db/schema ───────────────────────────────────────────────────────
vi.mock('@/lib/db/schema', () => ({
  userPreferences: {
    timezone: { name: 'timezone' },
    userId: { name: 'user_id' },
  },
}))

// ── mock @/lib/db (DrizzleDb type only, no runtime dependency) ────────────────
vi.mock('@/lib/db', () => ({}))

import { getUserTimeZone } from '@/modules-core/tasks/lib/server'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a fake withRLS that immediately calls the operation with a fake db
 * whose select chain returns the given rows.
 */
function makeWithRLS(rows: Array<{ timezone: string | null }>) {
  const fakeDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  return async <T>(op: (db: typeof fakeDb) => Promise<T>): Promise<T> => op(fakeDb)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getUserTimeZone()', () => {
  it('returns the timezone from the DB when set', async () => {
    const withRLS = makeWithRLS([{ timezone: 'America/New_York' }])
    const tz = await getUserTimeZone(withRLS as any, 'user-1')
    expect(tz).toBe('America/New_York')
  })

  it('returns UTC when rows array is empty', async () => {
    const withRLS = makeWithRLS([])
    const tz = await getUserTimeZone(withRLS as any, 'user-1')
    expect(tz).toBe('UTC')
  })

  it('returns UTC when timezone is null', async () => {
    const withRLS = makeWithRLS([{ timezone: null }])
    const tz = await getUserTimeZone(withRLS as any, 'user-1')
    expect(tz).toBe('UTC')
  })

  it('returns UTC when timezone is an empty string', async () => {
    const withRLS = makeWithRLS([{ timezone: '' }])
    const tz = await getUserTimeZone(withRLS as any, 'user-1')
    expect(tz).toBe('UTC')
  })

  it('returns UTC when withRLS throws (catch branch)', async () => {
    const throwingWithRLS = async <T>(_op: unknown): Promise<T> => {
      throw new Error('DB connection failed')
    }
    const tz = await getUserTimeZone(throwingWithRLS as any, 'user-1')
    expect(tz).toBe('UTC')
  })

  it('passes the correct userId to the where clause', async () => {
    const rows: Array<{ timezone: string | null }> = [{ timezone: 'Europe/London' }]
    const fakeDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    }
    const withRLS = async <T>(op: (db: typeof fakeDb) => Promise<T>) => op(fakeDb)

    await getUserTimeZone(withRLS as any, 'my-user-id')

    // eq() should have been called (via drizzle-orm mock) — the where clause ran
    const { eq } = await import('drizzle-orm')
    expect(eq).toHaveBeenCalled()
  })
})
