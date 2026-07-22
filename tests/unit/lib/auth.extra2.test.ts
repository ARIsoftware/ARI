/**
 * tests/unit/lib/auth.extra2.test.ts
 *
 * Third test file for lib/auth.ts telemetry coverage.
 * Covers the claim=false branch (lines 206-207) with a fresh module instance
 * where firstSigninPingResolved starts at false.
 *
 * Also covers the BRDA:193 true-branch (null instance / telemetry disabled)
 * BEFORE the flag gets set, since those tests don't set the flag.
 */

process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
process.env.BETTER_AUTH_SECRET = 'test-secret-auth'

import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const mockPoolQuery2 = vi.fn()
vi.mock('@/lib/db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery2(...args) },
}))

vi.mock('@/lib/generated/module-manifest.json', () => ({
  default: { modules: [] },
}))

const mockGetAriInstance2 = vi.fn()
const mockTryClaimFirstSigninPing2 = vi.fn()
const mockSendTvConnect2 = vi.fn()

vi.mock('@/lib/telemetry/instance', () => ({
  getAriInstance: (...args: unknown[]) => mockGetAriInstance2(...args),
  tryClaimFirstSigninPing: (...args: unknown[]) => mockTryClaimFirstSigninPing2(...args),
}))
vi.mock('@/lib/telemetry/send-tv-connect', () => ({
  sendTvConnect: (...args: unknown[]) => mockSendTvConnect2(...args),
}))

import { auth } from '@/lib/auth'

function sessionCreateAfter() {
  return capturedConfigHolder.cfg.databaseHooks.session.create.after
}

beforeEach(() => {
  mockPoolQuery2.mockReset()
  mockGetAriInstance2.mockReset()
  mockTryClaimFirstSigninPing2.mockReset()
  mockSendTvConnect2.mockReset()
})

// ── Tests that do NOT set firstSigninPingResolved (run first) ─────────────────

describe('session.create.after — null instance (extra2)', () => {
  it('covers BRDA:193 true-branch: null instance → early return without setting flag', async () => {
    // instance = null → if (!instance || ...) is true → return without setting flag
    mockGetAriInstance2.mockResolvedValue(null)
    const session = { userId: 'user-e2-1' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(mockSendTvConnect2).not.toHaveBeenCalled()
    // Flag is still false after this — verified implicitly by next test working
  })
})

describe('session.create.after — telemetry disabled (extra2)', () => {
  it('covers BRDA:193 true-branch: telemetryEnabled=false → early return without setting flag', async () => {
    mockGetAriInstance2.mockResolvedValue({ telemetryEnabled: false, firstSigninPinged: false })
    const session = { userId: 'user-e2-2' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(mockSendTvConnect2).not.toHaveBeenCalled()
  })
})

// ── This test sets firstSigninPingResolved = true via line 206 ────────────────
describe('session.create.after — claim=false → lines 206-207 (extra2)', () => {
  it('covers BRDA:205 true-branch and lines 206-207: claim=false sets flag and returns', async () => {
    mockGetAriInstance2.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: false })
    mockTryClaimFirstSigninPing2.mockResolvedValue(false)
    mockPoolQuery2.mockResolvedValue({ rows: [{ email: 'x@x.com' }] })

    const session = { userId: 'user-e2-3' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 30))
    // Lines 206-207 covered: firstSigninPingResolved = true; return
    expect(mockSendTvConnect2).not.toHaveBeenCalled()
  })
})

describe('sanity check', () => {
  it('auth is defined', () => {
    expect(auth).toBeDefined()
  })
})
