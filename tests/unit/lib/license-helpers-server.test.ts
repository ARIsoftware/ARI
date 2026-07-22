/**
 * Tests for lib/license-helpers-server.ts
 *
 * Mocks withAdminDb to avoid a real DB connection.
 */

process.env.DATABASE_URL = 'postgresql://localhost:5432/test'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockWithAdminDb = vi.fn()
vi.mock('@/lib/db', () => ({
  withAdminDb: (...args: unknown[]) => mockWithAdminDb(...args),
}))

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: { userId: 'userId', moduleId: 'moduleId', settings: 'settings' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}))

import { getLicenseKey } from '@/lib/license-helpers-server'

const originalLicenseKey = process.env.ARI_LICENSE_KEY

describe('getLicenseKey', () => {
  beforeEach(() => {
    mockWithAdminDb.mockReset()
    delete process.env.ARI_LICENSE_KEY
  })

  afterEach(() => {
    if (originalLicenseKey !== undefined) {
      process.env.ARI_LICENSE_KEY = originalLicenseKey
    } else {
      delete process.env.ARI_LICENSE_KEY
    }
  })

  it('returns the key from DB settings when present', async () => {
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => [{ settings: { key: 'db-license-key-123' } }],
      }
      return cb(db)
    })

    const result = await getLicenseKey('user-1')
    expect(result).toBe('db-license-key-123')
  })

  it('falls back to ARI_LICENSE_KEY env var when DB settings has no key', async () => {
    process.env.ARI_LICENSE_KEY = 'env-license-key'
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => [{ settings: {} }], // settings present but no key field
      }
      return cb(db)
    })

    const result = await getLicenseKey('user-1')
    expect(result).toBe('env-license-key')
  })

  it('falls back to ARI_LICENSE_KEY env var when DB returns empty rows', async () => {
    process.env.ARI_LICENSE_KEY = 'env-only-key'
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => [], // no rows
      }
      return cb(db)
    })

    const result = await getLicenseKey('user-1')
    expect(result).toBe('env-only-key')
  })

  it('returns null when no DB key and no env var', async () => {
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => [],
      }
      return cb(db)
    })

    const result = await getLicenseKey('user-1')
    expect(result).toBeNull()
  })

  it('returns null when DB settings is null', async () => {
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => [{ settings: null }],
      }
      return cb(db)
    })

    const result = await getLicenseKey('user-1')
    expect(result).toBeNull()
  })

  it('DB key takes priority over env var', async () => {
    process.env.ARI_LICENSE_KEY = 'env-key'
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => [{ settings: { key: 'db-key-wins' } }],
      }
      return cb(db)
    })

    const result = await getLicenseKey('user-1')
    expect(result).toBe('db-key-wins')
  })
})
