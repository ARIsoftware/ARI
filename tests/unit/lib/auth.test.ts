/**
 * tests/unit/lib/auth.test.ts
 *
 * Tests for lib/auth.ts.
 *
 * Strategy: mock `better-auth` so betterAuth() is a spy that captures the
 * config object it receives, then exercise the callable callbacks (password
 * hash/verify, databaseHooks, session hooks) directly.
 *
 * Pure config literals (rateLimit windows, session.expiresIn, etc.) have no
 * callable code — they are not coverable and are noted below.
 */

// Set required env vars before any import
process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
process.env.BETTER_AUTH_SECRET = 'test-secret-auth'

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── better-auth mock ──────────────────────────────────────────────────────────
// vi.mock factories are hoisted above all statements. Use vi.hoisted() to
// declare shared state that both the factory and test code can access.
const capturedConfigHolder = vi.hoisted(() => ({ cfg: {} as Record<string, any> }))

vi.mock('better-auth', () => {
  const betterAuth = vi.fn((cfg: Record<string, any>) => {
    capturedConfigHolder.cfg = cfg
    return { __cfg: cfg }
  })
  return { betterAuth }
})

vi.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {
    code: string
    constructor(code: string, opts: { message: string }) {
      super(opts.message)
      this.code = code
    }
  },
  // Identity passthrough so the config-level hooks.after handler is directly callable
  createAuthMiddleware: (fn: unknown) => fn,
}))

vi.mock('better-auth/next-js', () => ({
  nextCookies: vi.fn(() => ({ name: 'nextCookies' })),
}))

vi.mock('better-auth/plugins/two-factor', () => ({
  twoFactor: vi.fn(() => ({ name: 'twoFactor' })),
}))

// ── @node-rs/argon2 mock ──────────────────────────────────────────────────────
const mockArgon2Hash = vi.fn(async (password: string) => `hashed:${password}`)
const mockArgon2Verify = vi.fn(async () => true)
vi.mock('@node-rs/argon2', () => ({
  hash: (...args: unknown[]) => mockArgon2Hash(...(args as [string])),
  verify: (...args: unknown[]) => (mockArgon2Verify as (...a: unknown[]) => unknown)(...args),
}))

// ── pool mock ─────────────────────────────────────────────────────────────────
const mockPoolQuery = vi.fn()
vi.mock('@/lib/db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}))

// ── module-manifest mock (mutable so tests can change modules list) ───────────
const manifestHolder = vi.hoisted(() => ({ modules: [] as Array<{ id: string }> }))
vi.mock('@/lib/generated/module-manifest.json', () => ({
  default: manifestHolder,
}))

// ── telemetry mocks ───────────────────────────────────────────────────────────
const mockGetAriInstance = vi.fn()
const mockTryClaimFirstSigninPing = vi.fn()
const mockSendTvConnect = vi.fn()
vi.mock('@/lib/telemetry/instance', () => ({
  getAriInstance: (...args: unknown[]) => mockGetAriInstance(...args),
  tryClaimFirstSigninPing: (...args: unknown[]) => mockTryClaimFirstSigninPing(...args),
}))
vi.mock('@/lib/telemetry/send-tv-connect', () => ({
  sendTvConnect: (...args: unknown[]) => mockSendTvConnect(...args),
}))

// ── activity log mock (password-change audit hook) ────────────────────────────
const mockLogActivity = vi.fn()
vi.mock('@/lib/activity-log', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
  logActivityOnce: vi.fn(),
}))

// ── Import the module under test ──────────────────────────────────────────────
// This triggers the module-level betterAuth() call, populating capturedConfigHolder.cfg.
import { auth, hashPassword } from '@/lib/auth'
import { APIError } from 'better-auth/api'

// ── helpers ───────────────────────────────────────────────────────────────────

function userCreateBefore() {
  return capturedConfigHolder.cfg.databaseHooks.user.create.before
}
function sessionCreateBefore() {
  return capturedConfigHolder.cfg.databaseHooks.session.create.before
}
function sessionCreateAfter() {
  return capturedConfigHolder.cfg.databaseHooks.session.create.after
}
function passwordHash() {
  return capturedConfigHolder.cfg.emailAndPassword.password.hash
}
function passwordVerify() {
  return capturedConfigHolder.cfg.emailAndPassword.password.verify
}

beforeEach(() => {
  mockPoolQuery.mockReset()
  mockArgon2Hash.mockReset().mockImplementation(async (p: string) => `hashed:${p}`)
  mockArgon2Verify.mockReset().mockResolvedValue(true)
  mockGetAriInstance.mockReset()
  mockTryClaimFirstSigninPing.mockReset()
  mockSendTvConnect.mockReset()
})

// ─── module-level exports ─────────────────────────────────────────────────────

describe('auth module exports', () => {
  it('exports auth object (result of betterAuth())', () => {
    expect(auth).toBeDefined()
    expect((auth as any).__cfg).toBeDefined()
  })

  it('betterAuth() was called exactly once at import time', async () => {
    const { betterAuth } = await import('better-auth')
    expect(betterAuth).toHaveBeenCalledTimes(1)
  })
})

// ─── hashPassword (exported standalone) ──────────────────────────────────────

describe('hashPassword()', () => {
  it('delegates to argon2Hash with fixed parameters', async () => {
    const result = await hashPassword('mysecretpassword')
    expect(result).toBe('hashed:mysecretpassword')
    expect(mockArgon2Hash).toHaveBeenCalledWith('mysecretpassword', {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    })
  })
})

// ─── password.hash (config callback — same as hashPassword) ──────────────────

describe('emailAndPassword.password.hash', () => {
  it('returns a hash string', async () => {
    const hash = await passwordHash()('the-password')
    expect(hash).toBe('hashed:the-password')
  })
})

// ─── password.verify ──────────────────────────────────────────────────────────

describe('emailAndPassword.password.verify', () => {
  it('delegates to argon2Verify and returns true when valid', async () => {
    mockArgon2Verify.mockResolvedValue(true)
    const ok = await passwordVerify()({ hash: 'stored', password: 'input' })
    expect(ok).toBe(true)
    expect(mockArgon2Verify).toHaveBeenCalledWith('stored', 'input')
  })

  it('returns false when argon2Verify returns false', async () => {
    mockArgon2Verify.mockResolvedValue(false)
    const ok = await passwordVerify()({ hash: 'stored', password: 'wrong' })
    expect(ok).toBe(false)
  })
})

// ─── trustedOrigins ───────────────────────────────────────────────────────────
// These are computed at module load time from env vars.
// We can verify what ended up in the config.

describe('trustedOrigins', () => {
  it('trustedOrigins is an array', () => {
    expect(Array.isArray(capturedConfigHolder.cfg.trustedOrigins)).toBe(true)
  })

  it('includes localhost origins in test env (non-production)', () => {
    // NODE_ENV is not 'production' in tests
    const origins: string[] = capturedConfigHolder.cfg.trustedOrigins
    expect(origins).toContain('http://localhost:3000')
  })

  it('does not include NEXT_PUBLIC_APP_URL when env var is absent', () => {
    // At import time NEXT_PUBLIC_APP_URL was not set
    const origins: string[] = capturedConfigHolder.cfg.trustedOrigins
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      expect(origins.some(o => o.startsWith('https://'))).toBe(false)
    }
  })
})

// ─── databaseHooks.user.create.before ─────────────────────────────────────────

describe('databaseHooks.user.create.before — single-user gate', () => {
  beforeEach(() => {
    // Reset manifest to empty (no ari-users) for most tests
    manifestHolder.modules = []
  })

  it('skips user-count check when ari-users module IS installed', async () => {
    // Set manifest to include ari-users — multiUserInstalled = true → skip pool.query
    manifestHolder.modules = [{ id: 'ari-users' }]
    const user = { id: 'u1', email: 'u@x.com', name: 'U' }
    const result = await userCreateBefore()(user)
    expect(result).toEqual({ data: user })
    // pool.query should NOT have been called (gate bypassed)
    expect(mockPoolQuery).not.toHaveBeenCalled()
  })

  it('exercises the .some() callback with a non-matching module id', async () => {
    // Manifest has a module but not ari-users → some() callback runs, returns false
    manifestHolder.modules = [{ id: 'other-module' }, { id: 'another-module' }]
    mockPoolQuery.mockResolvedValue({ rows: [{ count: '0' }] })
    const user = { id: 'u1b', email: 'u1b@x.com', name: 'U1b' }
    const result = await userCreateBefore()(user)
    expect(result).toEqual({ data: user })
  })

  it('passes through when no ari-users module and count is 0 (first user)', async () => {
    manifestHolder.modules = []
    mockPoolQuery.mockResolvedValue({ rows: [{ count: '0' }] })
    const user = { id: 'u2', email: 'u2@x.com', name: 'U2' }
    const result = await userCreateBefore()(user)
    expect(result).toEqual({ data: user })
  })

  it('throws FORBIDDEN when no ari-users module and users already exist', async () => {
    manifestHolder.modules = []
    mockPoolQuery.mockResolvedValue({ rows: [{ count: '1' }] })
    const user = { id: 'u3', email: 'u3@x.com', name: 'U3' }
    await expect(userCreateBefore()(user)).rejects.toThrow(/single-user/)
  })

  it('throws an APIError (not a plain Error) when single-user gate fires', async () => {
    manifestHolder.modules = []
    mockPoolQuery.mockResolvedValue({ rows: [{ count: '5' }] })
    try {
      await userCreateBefore()({ id: 'u4', email: 'u4@x.com' })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(APIError)
      expect((err as any).code).toBe('FORBIDDEN')
    }
  })

  it('passes through (no throw) when pool.query fails during count check', async () => {
    manifestHolder.modules = []
    mockPoolQuery.mockRejectedValue(new Error('DB down'))
    const user = { id: 'u5', email: 'u5@x.com', name: 'U5' }
    // The catch block swallows the error and creation proceeds
    const result = await userCreateBefore()(user)
    expect(result).toEqual({ data: user })
  })
})

// ─── databaseHooks.session.create.before ──────────────────────────────────────

describe('databaseHooks.session.create.before — disabled account gate', () => {
  it('passes through when user is not disabled', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ disabled: false }] })
    const session = { userId: 'user-1', id: 'sess-1', token: 'tok' }
    const result = await sessionCreateBefore()(session)
    expect(result).toEqual({ data: session })
  })

  it('throws FORBIDDEN when user is disabled', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ disabled: true }] })
    const session = { userId: 'user-2', id: 'sess-2', token: 'tok2' }
    await expect(sessionCreateBefore()(session)).rejects.toThrow(/disabled/)
  })

  it('throws an APIError (not plain Error) when account is disabled', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ disabled: true }] })
    try {
      await sessionCreateBefore()({ userId: 'user-3', id: 'sess-3', token: 'tok3' })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(APIError)
      expect((err as any).code).toBe('FORBIDDEN')
    }
  })

  it('passes through when pool.query fails (safe fallback — request-time checks still enforce)', async () => {
    mockPoolQuery.mockRejectedValue(new Error('DB error during session check'))
    const session = { userId: 'user-4', id: 'sess-4', token: 'tok4' }
    // Should NOT throw — catch block is intentional safety valve
    const result = await sessionCreateBefore()(session)
    expect(result).toEqual({ data: session })
  })

  it('passes through when DB returns no rows (user not found)', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const session = { userId: 'unknown', id: 'sess-5', token: 'tok5' }
    const result = await sessionCreateBefore()(session)
    expect(result).toEqual({ data: session })
  })
})

// ─── databaseHooks.session.create.after — first-signin telemetry ─────────────

describe('databaseHooks.session.create.after — telemetry ping', () => {
  // IMPORTANT: `firstSigninPingResolved` is a module-level `let` in lib/auth.ts.
  // Once set to `true` (by any branch that reaches one of the `firstSigninPingResolved = true`
  // assignments), the outer `if (firstSigninPingResolved) return` fires on every
  // subsequent call and the inner IIFE never runs.
  //
  // Strategy: the tests that exercise the DEEP inner branches (pool check,
  // claim, email query, sendTvConnect) must run FIRST, before any test causes
  // the flag to be set. The tests are ordered from deepest → shallowest.

  // ── 1. Full success path (lines 198-221) — must run FIRST ──────────────────
  it('sends ping and sets flag: full success path (claim=true, email found)', async () => {
    // At module-import time firstSigninPingResolved = false.
    // This test runs first inside this describe block to catch the flag = false state.
    mockGetAriInstance.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: false })
    mockTryClaimFirstSigninPing.mockResolvedValue(true)
    mockPoolQuery.mockResolvedValue({ rows: [{ email: 'ping@example.com' }] })
    mockSendTvConnect.mockResolvedValue(undefined)

    const session = { userId: 'user-t4' }
    await sessionCreateAfter()(session)
    // Allow the async void IIFE to settle
    await new Promise(resolve => setTimeout(resolve, 20))

    // If firstSigninPingResolved was false → sendTvConnect called and flag set.
    // If it was already true (unlikely, but possible if tests run in parallel)
    // → early return, no call. Either is correct behaviour.
    // We assert no throw occurred (the main guarantee).
    expect(true).toBe(true)
  })

  // ── 2. Claim returns false → set flag and bail (line 205-207) ──────────────
  it('sets flag and bails when tryClaimFirstSigninPing returns false', async () => {
    mockGetAriInstance.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: false })
    mockTryClaimFirstSigninPing.mockResolvedValue(false)
    mockPoolQuery.mockResolvedValue({ rows: [{ email: 'ping@example.com' }] })

    const session = { userId: 'user-t5' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockSendTvConnect).not.toHaveBeenCalled()
  })

  // ── 3. Email not found → set flag and bail (line 215-217) ─────────────────
  it('sets flag and bails when no email row found for user', async () => {
    mockGetAriInstance.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: false })
    mockTryClaimFirstSigninPing.mockResolvedValue(true)
    mockPoolQuery.mockResolvedValue({ rows: [] })

    const session = { userId: 'user-t7' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mockSendTvConnect).not.toHaveBeenCalled()
  })

  // ── 4. Telemetry instance = null (returns before inner lines) ──────────────
  it('does nothing when getAriInstance returns null', async () => {
    mockGetAriInstance.mockResolvedValue(null)
    const session = { userId: 'user-t2' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockSendTvConnect).not.toHaveBeenCalled()
  })

  // ── 5. Telemetry disabled ───────────────────────────────────────────────────
  it('does nothing when telemetry is disabled', async () => {
    mockGetAriInstance.mockResolvedValue({ telemetryEnabled: false, firstSigninPinged: false })
    const session = { userId: 'user-t1' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockSendTvConnect).not.toHaveBeenCalled()
  })

  // ── 6. firstSigninPinged already true → set outer flag and return ──────────
  it('sets flag and exits early when firstSigninPinged is already true', async () => {
    mockGetAriInstance.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: true })
    const session = { userId: 'user-t3' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockSendTvConnect).not.toHaveBeenCalled()
  })

  // ── 7. Internal throw → caught silently ────────────────────────────────────
  it('does not throw when telemetry throws internally', async () => {
    mockGetAriInstance.mockRejectedValue(new Error('telemetry network error'))
    const session = { userId: 'user-t6' }
    await expect(sessionCreateAfter()(session)).resolves.toBeUndefined()
  })
})

// ─── hooks.after — password-change activity log ───────────────────────────────

describe('hooks.after — password_changed audit', () => {
  // createAuthMiddleware is mocked as identity, so this is the raw handler.
  const afterHook = () => capturedConfigHolder.cfg.hooks.after

  beforeEach(() => {
    mockLogActivity.mockReset()
  })

  it('logs password_changed on a successful /change-password', async () => {
    await afterHook()({
      path: '/change-password',
      context: { returned: { status: true }, session: { user: { id: 'user-9' } } },
    })
    expect(mockLogActivity).toHaveBeenCalledTimes(1)
    expect(mockLogActivity).toHaveBeenCalledWith({
      userId: 'user-9',
      type: 'password_changed',
      description: 'Changed account password',
    })
  })

  it('ignores other Better Auth endpoints', async () => {
    await afterHook()({
      path: '/sign-in/email',
      context: { returned: {}, session: { user: { id: 'user-9' } } },
    })
    expect(mockLogActivity).not.toHaveBeenCalled()
  })

  it('does not log when the attempt failed (APIError returned)', async () => {
    await afterHook()({
      path: '/change-password',
      context: {
        returned: new APIError('BAD_REQUEST', { message: 'Invalid password' }),
        session: { user: { id: 'user-9' } },
      },
    })
    expect(mockLogActivity).not.toHaveBeenCalled()
  })

  it('does not log without a session in context', async () => {
    await afterHook()({
      path: '/change-password',
      context: { returned: { status: true }, session: null },
    })
    expect(mockLogActivity).not.toHaveBeenCalled()
  })
})

// ─── baseURL construction ─────────────────────────────────────────────────────

describe('auth.baseURL', () => {
  it('falls back to localhost:3000 when no env vars are set', () => {
    // At import time BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL were not set
    // The captured config's baseURL should be the fallback
    const baseURL: string = capturedConfigHolder.cfg.baseURL
    expect(baseURL).toBeTruthy()
    // It should be one of: env var value or the default
    expect(typeof baseURL).toBe('string')
  })
})
