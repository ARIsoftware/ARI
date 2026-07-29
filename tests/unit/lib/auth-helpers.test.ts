/**
 * Tests for lib/auth-helpers.ts
 *
 * Mocks:
 *  - @/lib/auth        (auth.api.getSession)
 *  - next/headers      (headers())
 *  - @/lib/db/pool     (pool.query)
 *  - @/lib/db          (withAdminDb, withUserContext)
 *  - @/lib/api-keys    (hashApiKey, lookupApiKey, checkIpAllowed)
 *  - @/lib/db/schema/core-schema  (user table - just an object)
 *  - @/lib/db/ensure-schema       (reapplySchema)
 */

process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
process.env.BETTER_AUTH_SECRET = 'test-secret-for-auth-helpers'

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── auth mock ──────────────────────────────────────────────────────────────
const mockGetSession = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

// ── next/headers mock ─────────────────────────────────────────────────────
const mockHeadersGet = vi.fn()
const mockReqHeaders = { get: (name: string) => mockHeadersGet(name) }
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(mockReqHeaders),
}))

// ── pool mock ─────────────────────────────────────────────────────────────
const mockPoolQuery = vi.fn()
vi.mock('@/lib/db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}))

// ── db mock ───────────────────────────────────────────────────────────────
const mockWithAdminDb = vi.fn()
vi.mock('@/lib/db', () => ({
  withAdminDb: (...args: unknown[]) => mockWithAdminDb(...args),
  withUserContext: vi.fn(),
}))

// ── api-keys mock ─────────────────────────────────────────────────────────
const mockHashApiKey = vi.fn((k: string) => `hash:${k}`)
const mockLookupApiKey = vi.fn()
const mockCheckIpAllowed = vi.fn(() => true)
vi.mock('@/lib/api-keys', () => ({
  hashApiKey: (k: unknown) => mockHashApiKey(k as string),
  lookupApiKey: (...args: unknown[]) => mockLookupApiKey(...args),
  checkIpAllowed: (...args: unknown[]) => (mockCheckIpAllowed as (...a: unknown[]) => unknown)(...args),
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
const mockReapplySchema = vi.fn()
vi.mock('@/lib/db/ensure-schema', () => ({
  reapplySchema: (...args: unknown[]) => mockReapplySchema(...args),
}))

// Now import the module under test. Because getAuthenticatedUser is wrapped in
// React.cache, we can't easily reset it between tests. We test the underlying
// logic via checkUsersExist and requireAuthIfUsersExist which use the pool
// directly, and we test getAuthenticatedUser at the module level.

import { checkUsersExist, requireAuthIfUsersExist, requireAdminIfUsersExist, getAuthenticatedUser } from '@/lib/auth-helpers'
import { withUserContext } from '@/lib/db'

// ─── checkUsersExist ──────────────────────────────────────────────────────

describe('checkUsersExist — env guards', () => {
  it('returns no-env when DATABASE_URL is missing', async () => {
    const orig = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    const result = await checkUsersExist()
    expect(result.status).toBe('no-env')
    process.env.DATABASE_URL = orig
  })

  it('returns no-env when BETTER_AUTH_SECRET is missing', async () => {
    const orig = process.env.BETTER_AUTH_SECRET
    delete process.env.BETTER_AUTH_SECRET
    const result = await checkUsersExist()
    expect(result.status).toBe('no-env')
    process.env.BETTER_AUTH_SECRET = orig
  })
})

describe('checkUsersExist — DB results', () => {
  beforeEach(() => {
    mockPoolQuery.mockReset()
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
  })

  it('returns has-users when the query returns has_users=true', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ has_users: true }] })
    expect((await checkUsersExist()).status).toBe('has-users')
  })

  it('returns no-users when the query returns has_users=false', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ has_users: false }] })
    expect((await checkUsersExist()).status).toBe('no-users')
  })

  it('returns no-users when rows is empty', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    expect((await checkUsersExist()).status).toBe('no-users')
  })

  it('returns no-table when Postgres 42P01 is thrown', async () => {
    mockPoolQuery.mockRejectedValue({ code: '42P01' })
    expect((await checkUsersExist()).status).toBe('no-table')
  })

  it('returns db-error on other DB errors', async () => {
    mockPoolQuery.mockRejectedValue(new Error('connection refused'))
    expect((await checkUsersExist()).status).toBe('db-error')
  })
})

// ─── requireAuthIfUsersExist ──────────────────────────────────────────────

describe('requireAuthIfUsersExist', () => {
  beforeEach(() => {
    mockPoolQuery.mockReset()
    mockGetSession.mockReset()
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
  })

  it('returns 503 when checkUsersExist returns db-error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('boom'))
    const res = await requireAuthIfUsersExist(new Headers())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
    const json = await res!.json()
    expect(json.error).toBe('Service unavailable')
  })

  it('returns null when there are no users (setup mode)', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ has_users: false }] })
    const res = await requireAuthIfUsersExist(new Headers())
    expect(res).toBeNull()
  })

  it('returns null when status is no-table', async () => {
    mockPoolQuery.mockRejectedValue({ code: '42P01' })
    const res = await requireAuthIfUsersExist(new Headers())
    expect(res).toBeNull()
  })

  it('returns null when status is no-env', async () => {
    delete process.env.DATABASE_URL
    const res = await requireAuthIfUsersExist(new Headers())
    expect(res).toBeNull()
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
  })

  it('returns null when users exist and session is valid', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ has_users: true }] })
    mockGetSession.mockResolvedValue({ user: { id: 'u1' }, session: { token: 'tok' } })
    const res = await requireAuthIfUsersExist(new Headers())
    expect(res).toBeNull()
  })

  it('returns 401 when users exist but session is null', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ has_users: true }] })
    mockGetSession.mockResolvedValue(null)
    const res = await requireAuthIfUsersExist(new Headers())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    const json = await res!.json()
    expect(json.error).toBe('Unauthorized')
  })
})

// ─── requireAdminIfUsersExist ─────────────────────────────────────────────

describe('requireAdminIfUsersExist', () => {
  beforeEach(() => {
    mockPoolQuery.mockReset()
    mockGetSession.mockReset()
    mockHeadersGet.mockReturnValue(null)
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
    delete process.env.NEXT_PHASE
  })

  it('returns 503 when checkUsersExist returns db-error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('boom'))
    const res = await requireAdminIfUsersExist(new Headers())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
  })

  it('returns null when there are no users (first-run setup — /welcome can write .env.local)', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ has_users: false }] })
    const res = await requireAdminIfUsersExist(new Headers())
    expect(res).toBeNull()
  })

  it('returns null when status is no-table (pre-setup)', async () => {
    mockPoolQuery.mockRejectedValue({ code: '42P01' })
    const res = await requireAdminIfUsersExist(new Headers())
    expect(res).toBeNull()
  })

  it('returns 401 when users exist but there is no session', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ has_users: true }] })
    mockGetSession.mockResolvedValue(null)
    const res = await requireAdminIfUsersExist(new Headers())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('returns 403 when users exist and the caller is a non-admin user', async () => {
    // 1st pool.query = checkUsersExist; 2nd = loadUserAccess (role lookup)
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ has_users: true }] })
      .mockResolvedValueOnce({ rows: [{ role: 'user', permissions: null, disabled: false }] })
    mockGetSession.mockResolvedValue(makeSession())
    const res = await requireAdminIfUsersExist(new Headers())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const json = await res!.json()
    expect(json.error).toBe('Admin access required')
  })

  it('returns 403 when the caller is a disabled account', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ has_users: true }] })
      .mockResolvedValueOnce({ rows: [{ role: 'admin', permissions: null, disabled: true }] })
    mockGetSession.mockResolvedValue(makeSession())
    const res = await requireAdminIfUsersExist(new Headers())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })

  it('returns null when users exist and the caller is an admin', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ has_users: true }] })
      .mockResolvedValueOnce({ rows: [{ role: 'admin', permissions: null, disabled: false }] })
    mockGetSession.mockResolvedValue(makeSession())
    const res = await requireAdminIfUsersExist(new Headers())
    expect(res).toBeNull()
  })
})

// ─── getAuthenticatedUser ─────────────────────────────────────────────────────

// Helper: build a full session object as Better Auth would return it
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      name: 'Test User',
      image: null,
      ...((overrides.user as object) ?? {}),
    },
    session: {
      token: 'session-token-xyz',
      ...((overrides.session as object) ?? {}),
    },
  }
}

describe('getAuthenticatedUser — env guards', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockPoolQuery.mockReset()
    mockHeadersGet.mockReset()
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
    delete process.env.NEXT_PHASE
  })

  it('returns NULL_AUTH when NEXT_PHASE is phase-production-build', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    expect(result.session).toBeNull()
    expect(result.withRLS).toBeNull()
    delete process.env.NEXT_PHASE
  })

  it('returns NULL_AUTH when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
  })

  it('returns NULL_AUTH when BETTER_AUTH_SECRET is missing', async () => {
    delete process.env.BETTER_AUTH_SECRET
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    process.env.BETTER_AUTH_SECRET = 'test-secret'
  })
})

describe('getAuthenticatedUser — session auth', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockPoolQuery.mockReset()
    mockHeadersGet.mockReturnValue(null)
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
    delete process.env.NEXT_PHASE
  })

  it('returns NULL_AUTH when no session and no API key header', async () => {
    mockGetSession.mockResolvedValue(null)
    mockHeadersGet.mockReturnValue(null)
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    expect(result.session).toBeNull()
    expect(result.withRLS).toBeNull()
  })

  it('returns NULL_AUTH when session exists but loadUserAccess returns null (disabled/revoked)', async () => {
    mockGetSession.mockResolvedValue(makeSession())
    // pool.query returning disabled=true makes loadUserAccess return null
    mockPoolQuery.mockResolvedValue({ rows: [{ role: 'user', permissions: null, disabled: true }] })
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('returns authenticated user when session and access are valid', async () => {
    mockGetSession.mockResolvedValue(makeSession())
    mockPoolQuery.mockResolvedValue({ rows: [{ role: 'user', permissions: null, disabled: false }] })
    const result = await getAuthenticatedUser()
    expect(result.user).not.toBeNull()
    expect(result.user!.id).toBe('user-1')
    expect(result.user!.email).toBe('test@example.com')
    expect(result.user!.role).toBe('user')
    expect(result.session).not.toBeNull()
    expect(result.withRLS).not.toBeNull()
  })

  it('returns admin role when user is admin in the DB', async () => {
    mockGetSession.mockResolvedValue(makeSession())
    mockPoolQuery.mockResolvedValue({ rows: [{ role: 'admin', permissions: null, disabled: false }] })
    const result = await getAuthenticatedUser()
    expect(result.user!.role).toBe('admin')
  })

  it('populates user_metadata from the session', async () => {
    mockGetSession.mockResolvedValue(makeSession())
    mockPoolQuery.mockResolvedValue({ rows: [{ role: 'user', permissions: null, disabled: false }] })
    const result = await getAuthenticatedUser()
    expect(result.user!.user_metadata).toEqual({
      first_name: 'Test',
      last_name: 'User',
      full_name: 'Test User',
      avatar_url: null,
    })
  })

  it('withRLS delegates to withUserContext', async () => {
    mockGetSession.mockResolvedValue(makeSession())
    mockPoolQuery.mockResolvedValue({ rows: [{ role: 'user', permissions: null, disabled: false }] })
    const mockWithUserContext = vi.mocked(withUserContext)
    mockWithUserContext.mockResolvedValue('operation-result' as any)

    const result = await getAuthenticatedUser()
    const opFn = vi.fn().mockResolvedValue('op-result')
    const ret = await result.withRLS!(opFn as any)

    expect(mockWithUserContext).toHaveBeenCalledWith('user-1', opFn, 'user')
    expect(ret).toBe('operation-result')
  })

  it('returns NULL_AUTH when getSession throws (non-dev env)', async () => {
    mockGetSession.mockRejectedValue(new Error('network error'))
    mockHeadersGet.mockReturnValue(null)
    // Error is swallowed; no session → no API key → NULL_AUTH
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('returns NULL_AUTH when getSession throws in dev env (logs error)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSession.mockRejectedValue(new Error('auth fail'))
    mockHeadersGet.mockReturnValue(null)

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    // Error should have been logged in dev
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
    vi.unstubAllEnvs()
  })
})

describe('getAuthenticatedUser — API key auth', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockPoolQuery.mockReset()
    mockHashApiKey.mockReset().mockImplementation((k: string) => `hash:${k}`)
    mockLookupApiKey.mockReset()
    mockCheckIpAllowed.mockReset().mockReturnValue(true)
    mockWithAdminDb.mockReset()
    mockHeadersGet.mockReset()
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
    delete process.env.NEXT_PHASE
    // No session
    mockGetSession.mockResolvedValue(null)
  })

  it('returns NULL_AUTH when x-api-key header is absent', async () => {
    mockHeadersGet.mockReturnValue(null)
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('returns NULL_AUTH when lookupApiKey returns null (key not found)', async () => {
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'some-key' : null)
    mockLookupApiKey.mockResolvedValue(null)
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('returns NULL_AUTH when IP is not allowed', async () => {
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: ['192.168.1.1'] })
    mockCheckIpAllowed.mockReturnValue(false)
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('returns NULL_AUTH when fetchApiKeyUserRow returns null', async () => {
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)
    // withAdminDb returns empty array → userRow = null
    mockWithAdminDb.mockResolvedValue([])
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('returns NULL_AUTH when user is disabled (API key path)', async () => {
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)
    mockWithAdminDb.mockResolvedValue([{
      id: 'user-2', email: 'u@x.com', role: 'user', permissions: null,
      disabled: true, firstName: 'A', lastName: 'B', name: 'A B', image: null,
    }])
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('returns authenticated user + apiKey metadata on valid API key', async () => {
    mockHeadersGet.mockImplementation((h: string) => {
      if (h === 'x-api-key') return 'my-key'
      if (h === 'x-forwarded-for') return '10.0.0.1'
      if (h === 'user-agent') return 'TestAgent/1.0'
      return null
    })
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)
    mockWithAdminDb.mockResolvedValue([{
      id: 'user-2', email: 'u@x.com', role: 'user', permissions: null,
      disabled: false, firstName: 'A', lastName: 'B', name: 'A B', image: null,
    }])

    const result = await getAuthenticatedUser()
    expect(result.user).not.toBeNull()
    expect(result.user!.id).toBe('user-2')
    expect(result.user!.email).toBe('u@x.com')
    expect(result.session).toBeNull()
    expect((result as any).apiKey).toBeDefined()
    expect((result as any).apiKey.id).toBe('key-1')
    expect((result as any).apiKey.ipAddress).toBe('10.0.0.1')
    expect((result as any).apiKey.userAgent).toBe('TestAgent/1.0')
  })

  it('returns admin role for API key when DB row has role=admin', async () => {
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)
    mockWithAdminDb.mockResolvedValue([{
      id: 'user-2', email: 'admin@x.com', role: 'admin', permissions: null,
      disabled: false, firstName: 'A', lastName: 'B', name: 'A B', image: null,
    }])
    const result = await getAuthenticatedUser()
    expect(result.user!.role).toBe('admin')
  })

  it('uses x-real-ip fallback when x-forwarded-for is absent', async () => {
    mockHeadersGet.mockImplementation((h: string) => {
      if (h === 'x-api-key') return 'my-key'
      if (h === 'x-real-ip') return '172.16.0.1'
      return null
    })
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)
    mockWithAdminDb.mockResolvedValue([{
      id: 'user-2', email: 'u@x.com', role: 'user', permissions: null,
      disabled: false, firstName: null, lastName: null, name: null, image: null,
    }])
    const result = await getAuthenticatedUser()
    expect((result as any).apiKey.ipAddress).toBe('172.16.0.1')
  })

  it('returns NULL_AUTH and logs error when API key lookup throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockRejectedValue(new Error('DB failure'))
    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('API key auth failed'), expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('withRLS on API key path delegates to withUserContext', async () => {
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)
    mockWithAdminDb.mockResolvedValue([{
      id: 'user-2', email: 'u@x.com', role: 'user', permissions: null,
      disabled: false, firstName: null, lastName: null, name: null, image: null,
    }])
    const mockWithUserContext = vi.mocked(withUserContext)
    mockWithUserContext.mockResolvedValue('api-result' as any)

    const result = await getAuthenticatedUser()
    const opFn = vi.fn().mockResolvedValue('op')
    await result.withRLS!(opFn as any)
    expect(mockWithUserContext).toHaveBeenCalledWith('user-2', opFn, 'user')
  })

  it('invokes withAdminDb callback with a fake db (covers fetchApiKeyUserRow inner callback)', async () => {
    // Make withAdminDb actually invoke the callback so the inner db.select()...limit() runs
    const fakeDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: 'user-2', email: 'u@x.com', role: 'user', permissions: null,
        disabled: false, firstName: null, lastName: null, name: null, image: null,
      }]),
    }
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => any) => cb(fakeDb))
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)

    const result = await getAuthenticatedUser()
    expect(result.user!.id).toBe('user-2')
    expect(fakeDb.select).toHaveBeenCalled()
  })

  it('heals on 42703 error in fetchApiKeyUserRow (schema upgrade path)', async () => {
    // First call to withAdminDb throws 42703; reapplySchema heals; second call succeeds
    const fakeDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: 'user-2', email: 'u@x.com', role: 'user', permissions: null,
        disabled: false, firstName: null, lastName: null, name: null, image: null,
      }]),
    }
    let callCount = 0
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => any) => {
      callCount++
      if (callCount === 1) {
        const err: any = new Error('column disabled does not exist')
        err.code = '42703'
        throw err
      }
      return cb(fakeDb)
    })
    mockReapplySchema.mockResolvedValue(true)
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)

    const result = await getAuthenticatedUser()
    expect(result.user!.id).toBe('user-2')
    expect(mockReapplySchema).toHaveBeenCalled()
  })

  it('rethrows non-42703 error from fetchApiKeyUserRow (API key catch logs and returns NULL_AUTH)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // fetchApiKeyUserRow throws non-42703 → rethrown → getAuthenticatedUser catch → NULL_AUTH
    mockWithAdminDb.mockRejectedValue(new Error('DB connection refused'))
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ─── queryUserAccess / loadUserAccess internal branches ───────────────────────
// These are covered indirectly via getAuthenticatedUser with specific pool errors.

describe('getAuthenticatedUser — queryUserAccess 42703 and loadUserAccess healing', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockPoolQuery.mockReset()
    mockReapplySchema.mockReset()
    mockHeadersGet.mockReturnValue(null)
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
    process.env.BETTER_AUTH_SECRET = 'test-secret'
    delete process.env.NEXT_PHASE
  })

  it('heals on 42703 from queryUserAccess → reapplySchema → retry succeeds', async () => {
    // Simulate: session exists → loadUserAccess → queryUserAccess throws 42703
    //   → reapplySchema heals → retry returns valid access
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      if (poolCallCount === 1) {
        // First pool.query (queryUserAccess) throws 42703
        const err: any = new Error('column disabled does not exist')
        err.code = '42703'
        throw err
      }
      // Second pool.query (retry after healing) succeeds
      return { rows: [{ role: 'user', permissions: null, disabled: false }] }
    })
    mockReapplySchema.mockResolvedValue(true)

    const result = await getAuthenticatedUser()
    expect(result.user!.id).toBe('user-1')
    expect(mockReapplySchema).toHaveBeenCalled()
  })

  it('returns NULL_AUTH when 42703 occurs and reapplySchema returns false', async () => {
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)

    mockPoolQuery.mockRejectedValue(Object.assign(new Error('missing column'), { code: '42703' }))
    mockReapplySchema.mockResolvedValue(false)

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('retries on transient ECONNREFUSED error then succeeds on second attempt', async () => {
    // isTransientDbError coverage: first attempt throws ECONNREFUSED → retry
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      if (poolCallCount === 1) {
        const err: any = new Error('connect ECONNREFUSED 127.0.0.1:5432')
        err.code = 'ECONNREFUSED'
        throw err
      }
      return { rows: [{ role: 'user', permissions: null, disabled: false }] }
    })

    const result = await getAuthenticatedUser()
    expect(result.user!.id).toBe('user-1')
    expect(poolCallCount).toBe(2)
  })

  it('returns NULL_AUTH when both attempts fail with transient errors', async () => {
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      const err: any = new Error('connection reset')
      // First attempt: ECONNRESET (transient) → retry
      // Second attempt: non-transient → logs and returns null
      err.code = poolCallCount === 1 ? 'ECONNRESET' : 'SOME_OTHER_ERROR'
      throw err
    })

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    expect(poolCallCount).toBe(2)
    consoleSpy.mockRestore()
  })

  it('covers "Connection terminated" message branch in isTransientDbError', async () => {
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      const err: any = new Error(poolCallCount === 1 ? 'Connection terminated unexpectedly' : 'other error')
      err.code = undefined
      throw err
    })

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    expect(poolCallCount).toBe(2) // retried once
    consoleSpy.mockRestore()
  })

  it('covers "connection is closed" message branch in isTransientDbError', async () => {
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      const err: any = new Error(poolCallCount === 1 ? 'This connection is closed' : 'other')
      err.code = undefined
      throw err
    })

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    consoleSpy.mockRestore()
  })

  it('covers "Client has encountered a connection error" message branch in isTransientDbError', async () => {
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      const err: any = new Error(poolCallCount === 1 ? 'Client has encountered a connection error' : 'other')
      err.code = undefined
      throw err
    })

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    consoleSpy.mockRestore()
  })

  it('returns NULL_AUTH when 42703 heals but retry still returns null (disabled user)', async () => {
    // Covers: retry ?? null when retry = null (user row disabled/missing on retry)
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      if (poolCallCount === 1) {
        const err: any = new Error('missing column')
        err.code = '42703'
        throw err
      }
      // Retry returns disabled user → queryUserAccess returns null
      return { rows: [{ role: 'user', permissions: null, disabled: true }] }
    })
    mockReapplySchema.mockResolvedValue(true)

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
  })

  it('covers fetchApiKeyUserRow 42703 healing where reapplySchema returns false (rethrows)', async () => {
    // withAdminDb throws 42703 → reapplySchema false → error rethrown → caught by API key try/catch
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockWithAdminDb.mockRejectedValue(Object.assign(new Error('missing col'), { code: '42703' }))
    mockReapplySchema.mockResolvedValue(false)
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockGetSession.mockResolvedValue(null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)

    const result = await getAuthenticatedUser()
    expect(result.user).toBeNull()
    consoleSpy.mockRestore()
  })

  it('fetchApiKeyUserRow: 42703 → heals → retry returns null (no user row found)', async () => {
    // Covers: BRDA:122,17,1 — the `?? null` fallback when the healed retry returns []
    const fakeDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // empty → [0] is undefined → ?? null
    }
    let callCount = 0
    mockWithAdminDb.mockImplementation(async (cb: (db: any) => any) => {
      callCount++
      if (callCount === 1) {
        const err: any = new Error('missing column')
        err.code = '42703'
        throw err
      }
      return cb(fakeDb)
    })
    mockReapplySchema.mockResolvedValue(true)
    mockHeadersGet.mockImplementation((h: string) => h === 'x-api-key' ? 'my-key' : null)
    mockGetSession.mockResolvedValue(null)
    mockLookupApiKey.mockResolvedValue({ id: 'key-1', userId: 'user-2', allowedIps: null })
    mockCheckIpAllowed.mockReturnValue(true)

    const result = await getAuthenticatedUser()
    // null user row → NULL_AUTH
    expect(result.user).toBeNull()
    expect(mockReapplySchema).toHaveBeenCalled()
  })

  it('covers isTransientDbError with a plain object error (no message property)', async () => {
    // Covers BRDA:17 branch where ?.message is undefined → || "" fires
    const sess = makeSession()
    mockGetSession.mockResolvedValue(sess)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let poolCallCount = 0
    mockPoolQuery.mockImplementation(async () => {
      poolCallCount++
      // Throw a plain object with code but no message property — triggers ?.message = undefined
      if (poolCallCount === 1) {
        const err = { code: 'ECONNREFUSED' } // no .message
        throw err
      }
      return { rows: [{ role: 'user', permissions: null, disabled: false }] }
    })

    const result = await getAuthenticatedUser()
    // Transient → retry → succeeds
    expect(result.user?.id).toBe('user-1')
    consoleSpy.mockRestore()
  })
})
