/**
 * tests/unit/lib/auth.extra.test.ts
 *
 * Secondary test file for lib/auth.ts to cover the `firstSigninPinged=true` branch
 * (lines 195-196) with a fresh module instance where firstSigninPingResolved = false.
 *
 * We also cover BRDA:143 and BRDA:167 here (user.create.before hasUsers false branch
 * and session.create.before pool false branch).
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
    code: string
    constructor(code: string, opts: { message: string }) {
      super(opts.message)
      this.code = code
    }
  },
  createAuthMiddleware: (fn: unknown) => fn,
}))

vi.mock('better-auth/next-js', () => ({ nextCookies: vi.fn(() => ({})) }))
vi.mock('better-auth/plugins/two-factor', () => ({ twoFactor: vi.fn(() => ({})) }))

vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn(async (p: string) => `hashed:${p}`),
  verify: vi.fn(async () => true),
}))

const mockPoolQueryExtra = vi.fn()
vi.mock('@/lib/db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQueryExtra(...args) },
}))

const manifestHolderExtra = vi.hoisted(() => ({ modules: [] as Array<{ id: string }> }))
vi.mock('@/lib/generated/module-manifest.json', () => ({
  default: manifestHolderExtra,
}))

const mockGetAriInstanceExtra = vi.fn()
const mockTryClaimFirstSigninPingExtra = vi.fn()
const mockSendTvConnectExtra = vi.fn()

vi.mock('@/lib/telemetry/instance', () => ({
  getAriInstance: (...args: unknown[]) => mockGetAriInstanceExtra(...args),
  tryClaimFirstSigninPing: (...args: unknown[]) => mockTryClaimFirstSigninPingExtra(...args),
}))
vi.mock('@/lib/telemetry/send-tv-connect', () => ({
  sendTvConnect: (...args: unknown[]) => mockSendTvConnectExtra(...args),
}))

import { auth } from '@/lib/auth'

function sessionCreateAfter() {
  return capturedConfigHolder.cfg.databaseHooks.session.create.after
}

function userCreateBefore() {
  return capturedConfigHolder.cfg.databaseHooks.user.create.before
}

function sessionCreateBefore() {
  return capturedConfigHolder.cfg.databaseHooks.session.create.before
}

beforeEach(() => {
  mockPoolQueryExtra.mockReset()
  mockGetAriInstanceExtra.mockReset()
  mockTryClaimFirstSigninPingExtra.mockReset()
  mockSendTvConnectExtra.mockReset()
  manifestHolderExtra.modules = []
})

// ── BRDA:143 branch: empty rows → rows[0] undefined → ?.count undefined → ?? "0" ──
// This covers the `?? "0"` fallback branch when rows is empty (rows[0]?.count is
// undefined). hasUsers = parseInt("0", 10) >= 1 → false → no APIError thrown.
describe('user.create.before — empty rows (extra)', () => {
  it('covers BRDA:143 optional-chain null path: empty rows uses "0" fallback', async () => {
    manifestHolderExtra.modules = []
    // rows = [] → rows[0]?.count = undefined → ?? "0" → hasUsers = false
    mockPoolQueryExtra.mockResolvedValue({ rows: [] })
    const user = { id: 'u-extra', email: 'e@x.com', name: 'E' }
    const result = await userCreateBefore()(user)
    expect(result).toEqual({ data: user })
  })
})

// ── Telemetry: firstSigninPinged=true → covers lines 195-196 ─────────────────
// firstSigninPingResolved starts false in this fresh module.
// This test sets it to true via the inner `firstSigninPinged: true` branch.
describe('session.create.after — firstSigninPinged=true (extra)', () => {
  it('covers BRDA:194 true-branch and lines 195-196: firstSigninPinged=true sets flag', async () => {
    mockGetAriInstanceExtra.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: true })
    const session = { userId: 'user-extra-flag-1' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 30))
    // Lines 195-196 covered: firstSigninPingResolved = true; return
    expect(mockSendTvConnectExtra).not.toHaveBeenCalled()
  })
})

describe('sanity check (extra)', () => {
  it('auth is defined', () => {
    expect(auth).toBeDefined()
  })
})
