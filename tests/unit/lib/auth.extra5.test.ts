/**
 * tests/unit/lib/auth.extra5.test.ts
 *
 * Test file for lib/auth.ts where pool is null.
 * Covers:
 * - BRDA:167,8,1 — session.create.before: if (pool) false branch (pool=null → skip disabled check)
 * - BRDA:198,14,0 — session.create.after: if (!pool) true branch (pool=null → early return)
 * - Also covers user.create.before: if (pool && !multiUserInstalled) false branch (pool=null → skip)
 */

process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
process.env.BETTER_AUTH_SECRET = 'test-secret-auth'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const capturedConfigHolder5 = vi.hoisted(() => ({ cfg: {} as Record<string, any> }))

vi.mock('better-auth', () => {
  const betterAuth = vi.fn((cfg: Record<string, any>) => {
    capturedConfigHolder5.cfg = cfg
    return { __cfg: cfg }
  })
  return { betterAuth }
})

vi.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {
    constructor(public code: string, opts: { message: string }) {
      super(opts.message)
    }
  },
}))

vi.mock('better-auth/next-js', () => ({ nextCookies: vi.fn(() => ({})) }))
vi.mock('better-auth/plugins/two-factor', () => ({ twoFactor: vi.fn(() => ({})) }))

vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn(async (p: string) => `hashed:${p}`),
  verify: vi.fn(async () => true),
}))

// Pool is NULL — this covers the `if (pool)` false branches and `if (!pool)` true branches
vi.mock('@/lib/db/pool', () => ({
  pool: null,
}))

vi.mock('@/lib/generated/module-manifest.json', () => ({
  default: { modules: [] },
}))

const mockGetAriInstance5 = vi.fn()
const mockTryClaimFirstSigninPing5 = vi.fn()
const mockSendTvConnect5 = vi.fn()

vi.mock('@/lib/telemetry/instance', () => ({
  getAriInstance: (...args: unknown[]) => mockGetAriInstance5(...args),
  tryClaimFirstSigninPing: (...args: unknown[]) => mockTryClaimFirstSigninPing5(...args),
}))
vi.mock('@/lib/telemetry/send-tv-connect', () => ({
  sendTvConnect: (...args: unknown[]) => mockSendTvConnect5(...args),
}))

import { auth } from '@/lib/auth'

function userCreateBefore5() {
  return capturedConfigHolder5.cfg.databaseHooks.user.create.before
}
function sessionCreateBefore5() {
  return capturedConfigHolder5.cfg.databaseHooks.session.create.before
}
function sessionCreateAfter5() {
  return capturedConfigHolder5.cfg.databaseHooks.session.create.after
}

beforeEach(() => {
  mockGetAriInstance5.mockReset()
  mockTryClaimFirstSigninPing5.mockReset()
  mockSendTvConnect5.mockReset()
})

// ── BRDA:167,8,1 — session.create.before: pool=null → skip disabled check ────
describe('session.create.before — pool=null (extra5)', () => {
  it('passes through without checking disabled when pool is null', async () => {
    const session = { userId: 'user-e5-1', id: 'sess-e5-1', token: 'tok' }
    // pool=null → if (pool) false → skip the disabled check → return { data: session }
    const result = await sessionCreateBefore5()(session)
    expect(result).toEqual({ data: session })
  })
})

// ── user.create.before: pool=null → skip count check ─────────────────────────
describe('user.create.before — pool=null (extra5)', () => {
  it('passes through without checking user count when pool is null', async () => {
    const user = { id: 'u-e5', email: 'e5@x.com', name: 'E5' }
    // pool=null → if (pool && !multiUserInstalled) false → skip count check
    const result = await userCreateBefore5()(user)
    expect(result).toEqual({ data: user })
  })
})

// ── BRDA:198,14,0 — session.create.after: pool=null → early return in IIFE ───
describe('session.create.after — pool=null (extra5)', () => {
  it('returns early from telemetry IIFE when pool is null', async () => {
    // firstSigninPingResolved = false (fresh module)
    // Instance has telemetry enabled, not yet pinged
    // But pool=null → if (!pool) return at line 198
    mockGetAriInstance5.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: false })
    mockTryClaimFirstSigninPing5.mockResolvedValue(true) // claim would succeed
    // pool=null means the query for email is skipped

    const session = { userId: 'user-e5-telemetry' }
    await sessionCreateAfter5()(session)
    await new Promise(resolve => setTimeout(resolve, 30))
    // pool=null → if (!pool) return → sendTvConnect never called
    expect(mockSendTvConnect5).not.toHaveBeenCalled()
  })
})

describe('sanity check (extra5)', () => {
  it('auth is defined', () => {
    expect(auth).toBeDefined()
  })
})
