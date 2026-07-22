/**
 * tests/unit/lib/auth-helpers.extra.test.ts
 *
 * Extra test file for lib/auth-helpers.ts with pool mocked as null.
 * Covers:
 * - BRDA:41,3,0 — queryUserAccess: if (!pool) return null (pool is null)
 * - BRDA:268,33,0 — checkUsersExist: if (!pool) return { status: "no-pool" } (pool is null)
 */

process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
process.env.BETTER_AUTH_SECRET = 'test-secret-extra'

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── auth mock ──────────────────────────────────────────────────────────────
const mockGetSessionExtra = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSessionExtra(...args) } },
}))

// ── next/headers mock ─────────────────────────────────────────────────────
const mockHeadersGetExtra = vi.fn()
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: (name: string) => mockHeadersGetExtra(name) }),
}))

// ── pool mock: pool is NULL ───────────────────────────────────────────────
vi.mock('@/lib/db/pool', () => ({
  pool: null,
}))

// ── db mock ───────────────────────────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  withAdminDb: vi.fn(),
  withUserContext: vi.fn(),
}))

// ── api-keys mock ─────────────────────────────────────────────────────────
vi.mock('@/lib/api-keys', () => ({
  hashApiKey: vi.fn((k: unknown) => `hash:${k}`),
  lookupApiKey: vi.fn(),
  checkIpAllowed: vi.fn(() => true),
}))

// ── core-schema mock ──────────────────────────────────────────────────────
vi.mock('@/lib/db/schema/core-schema', () => ({
  user: { id: 'id', role: 'role', permissions: 'permissions', disabled: 'disabled' },
}))

// ── drizzle-orm mock ──────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  sql: vi.fn(),
}))

// ── ensure-schema mock ────────────────────────────────────────────────────
vi.mock('@/lib/db/ensure-schema', () => ({
  reapplySchema: vi.fn(),
}))

import { checkUsersExist, getAuthenticatedUser } from '@/lib/auth-helpers'

beforeEach(() => {
  mockGetSessionExtra.mockReset()
  mockHeadersGetExtra.mockReset().mockReturnValue(null)
})

// ── checkUsersExist with pool=null ────────────────────────────────────────

describe('checkUsersExist — pool is null (extra)', () => {
  it('returns no-pool when pool is null (BRDA:268 true branch)', async () => {
    // pool=null → if (!pool) return { status: "no-pool" }
    const result = await checkUsersExist()
    expect(result.status).toBe('no-pool')
  })
})

// ── getAuthenticatedUser with pool=null (covers queryUserAccess pool=null) ──

describe('getAuthenticatedUser — pool=null (extra)', () => {
  it('returns NULL_AUTH when session exists but pool=null (queryUserAccess returns null)', async () => {
    // Session exists but pool=null → queryUserAccess if (!pool) return null
    // loadUserAccess returns null → getAuthenticatedUser returns NULL_AUTH
    mockGetSessionExtra.mockResolvedValue({
      user: {
        id: 'user-extra', email: 'e@x.com', firstName: 'E', lastName: 'X',
        name: 'E X', image: null,
      },
      session: { token: 'tok-extra' },
    })
    // pool=null → queryUserAccess returns null immediately → loadUserAccess returns null

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })
})
