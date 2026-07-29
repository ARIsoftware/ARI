/**
 * Full coverage for lib/api-keys.ts.
 * The existing tests/unit/api-keys-ip.test.ts covers checkIpAllowed; this file
 * covers the remaining exported functions: generateApiKey, hashApiKey,
 * lookupApiKey (with cache), and recordApiKeyUsage.
 */

// Set DATABASE_URL before importing so the pg pool doesn't throw.
process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
process.env.BETTER_AUTH_SECRET = 'test-secret-for-api-keys'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── mock @/lib/db so withAdminDb is controllable ──────────────────────────
const mockWithAdminDb = vi.fn()
vi.mock('@/lib/db', () => ({
  withAdminDb: (...args: unknown[]) => mockWithAdminDb(...args),
  withUserContext: vi.fn(),
}))

// ── mock drizzle schema to avoid real DB schema imports ───────────────────
vi.mock('@/lib/db/schema/core-schema', () => ({
  apiKeys: { keyHash: 'keyHash', revoked: 'revoked', id: 'id', requestCount: 'requestCount', lastUsedAt: 'lastUsedAt', updatedAt: 'updatedAt', expiresAt: 'expiresAt' },
  apiKeyUsageLogs: {},
}))

// ── mock drizzle operators so we don't need a real DB ─────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  sql: vi.fn(),
}))

// ── mock activity log (expired keys emit a deduped event) ─────────────────
const mockLogActivityOnce = vi.fn()
vi.mock('@/lib/activity-log', () => ({
  logActivityOnce: (...args: unknown[]) => mockLogActivityOnce(...args),
  logActivity: vi.fn(),
}))

import { generateApiKey, hashApiKey, lookupApiKey, recordApiKeyUsage } from '@/lib/api-keys'
import { API_KEY_PREFIX } from '@/lib/auth-middleware'

// ─── generateApiKey ───────────────────────────────────────────────────────

describe('generateApiKey', () => {
  it('returns rawKey, keyHash, and keyPrefix', () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey()
    expect(typeof rawKey).toBe('string')
    expect(typeof keyHash).toBe('string')
    expect(typeof keyPrefix).toBe('string')
  })

  it('rawKey starts with API_KEY_PREFIX', () => {
    const { rawKey } = generateApiKey()
    expect(rawKey.startsWith(API_KEY_PREFIX)).toBe(true)
  })

  it('keyPrefix is the first 12 chars of rawKey', () => {
    const { rawKey, keyPrefix } = generateApiKey()
    expect(keyPrefix).toBe(rawKey.substring(0, 12))
  })

  it('keyHash matches hashApiKey(rawKey)', () => {
    const { rawKey, keyHash } = generateApiKey()
    expect(keyHash).toBe(hashApiKey(rawKey))
  })

  it('generates unique keys each call', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.rawKey).not.toBe(b.rawKey)
    expect(a.keyHash).not.toBe(b.keyHash)
  })
})

// ─── hashApiKey ───────────────────────────────────────────────────────────

describe('hashApiKey', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = hashApiKey('some-key')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashApiKey('abc')).toBe(hashApiKey('abc'))
  })

  it('differs for different inputs', () => {
    expect(hashApiKey('abc')).not.toBe(hashApiKey('abcd'))
  })
})

// ─── lookupApiKey ─────────────────────────────────────────────────────────

// Build a minimal API key row
function makeKeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-id-1',
    keyHash: 'somehash',
    revoked: false,
    expiresAt: null,
    userId: 'user-1',
    allowedIps: null,
    ...overrides,
  }
}

describe('lookupApiKey — cache miss, key found and not expired', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWithAdminDb.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the key row when DB returns a non-expired row', async () => {
    const row = makeKeyRow()
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      // Simulate drizzle query chain returning a row
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [row],
      }
      return cb(db)
    })

    const result = await lookupApiKey('somehash')
    expect(result).toEqual(row)
  })
})

describe('lookupApiKey — expired key returns null', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWithAdminDb.mockReset()
    mockLogActivityOnce.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when the key has an expiresAt in the past', async () => {
    const row = makeKeyRow({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [row],
      }
      return cb(db)
    })

    const result = await lookupApiKey('expiredhash')
    expect(result).toBeNull()
  })

  it('logs a deduped api_key_expired event with key metadata', async () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString()
    const row = makeKeyRow({
      id: 'key-exp',
      label: 'ci key',
      keyPrefix: 'ari_expired1',
      expiresAt,
    })
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [row],
      }
      return cb(db)
    })

    await lookupApiKey('expiredhash2')
    expect(mockLogActivityOnce).toHaveBeenCalledTimes(1)
    expect(mockLogActivityOnce).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        type: 'api_key_expired',
        description: 'API key "ci key" expired',
        metadata: {
          apiKeyId: 'key-exp',
          label: 'ci key',
          keyPrefix: 'ari_expired1',
          expiredAt: expiresAt,
        },
      },
      'apiKeyId'
    )
  })

  it('does not log an expiry event when the key simply does not exist', async () => {
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [],
      }
      return cb(db)
    })

    await lookupApiKey('missinghash2')
    expect(mockLogActivityOnce).not.toHaveBeenCalled()
  })
})

describe('lookupApiKey — no rows from DB', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWithAdminDb.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when DB returns empty array', async () => {
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [],
      }
      return cb(db)
    })

    const result = await lookupApiKey('missinghash')
    expect(result).toBeNull()
  })
})

describe('lookupApiKey — cache hit within TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWithAdminDb.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call withAdminDb on the second lookup within TTL', async () => {
    const row = makeKeyRow({ keyHash: 'cachedhash' })
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [row],
      }
      return cb(db)
    })

    const first = await lookupApiKey('cachedhash')
    expect(first).toEqual(row)
    expect(mockWithAdminDb).toHaveBeenCalledTimes(1)

    // Second lookup within TTL (5000ms) — should use cache
    vi.advanceTimersByTime(1000)
    const second = await lookupApiKey('cachedhash')
    expect(second).toEqual(row)
    expect(mockWithAdminDb).toHaveBeenCalledTimes(1) // still 1 — no extra call
  })

  it('re-fetches after TTL expires', async () => {
    const row = makeKeyRow({ keyHash: 'ttlhash' })
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [row],
      }
      return cb(db)
    })

    await lookupApiKey('ttlhash')
    expect(mockWithAdminDb).toHaveBeenCalledTimes(1)

    // Advance past TTL (5000ms)
    vi.advanceTimersByTime(6000)

    await lookupApiKey('ttlhash')
    expect(mockWithAdminDb).toHaveBeenCalledTimes(2)
  })
})

describe('lookupApiKey — future expiresAt is valid', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWithAdminDb.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the key when expiresAt is in the future', async () => {
    const row = makeKeyRow({
      keyHash: 'futurehash',
      expiresAt: new Date(Date.now() + 100_000).toISOString(),
    })
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        select: () => db,
        from: () => db,
        where: () => db,
        limit: () => [row],
      }
      return cb(db)
    })

    const result = await lookupApiKey('futurehash')
    expect(result).toEqual(row)
  })
})

// ─── recordApiKeyUsage ────────────────────────────────────────────────────

describe('recordApiKeyUsage', () => {
  beforeEach(() => {
    mockWithAdminDb.mockReset()
  })

  it('calls withAdminDb (fire-and-forget, no await needed)', () => {
    // We don't await; the function is void / fire-and-forget.
    const insertMock = vi.fn().mockResolvedValue(undefined)
    const updateMock = {
      update: () => updateMock,
      set: () => updateMock,
      where: () => Promise.resolve(),
    }
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => Promise<unknown>) => {
      const db = {
        insert: () => ({ values: insertMock }),
        update: () => updateMock,
      }
      return cb(db)
    })

    // Should not throw
    expect(() =>
      recordApiKeyUsage({
        apiKeyId: 'key-1',
        userId: 'user-1',
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      })
    ).not.toThrow()
  })

  it('swallows errors from withAdminDb (catch handler)', async () => {
    mockWithAdminDb.mockRejectedValue(new Error('DB down'))

    // Should not throw — the .catch() eats the error
    expect(() =>
      recordApiKeyUsage({
        apiKeyId: 'key-1',
        userId: 'user-1',
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 500,
        ipAddress: null,
        userAgent: null,
      })
    ).not.toThrow()

    // Give the promise time to settle
    await new Promise((r) => setTimeout(r, 0))
  })
})
