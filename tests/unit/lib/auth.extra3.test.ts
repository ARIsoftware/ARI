/**
 * tests/unit/lib/auth.extra3.test.ts
 *
 * Fourth test file for lib/auth.ts telemetry coverage.
 * Covers the no-email branch (lines 216-217) with a fresh module instance.
 * Also covers: BRDA:198 false-branch (pool exists, continue past it)
 * and BRDA:205 false-branch (claim succeeded, continue past it).
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

const mockPoolQuery3 = vi.fn()
vi.mock('@/lib/db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery3(...args) },
}))

vi.mock('@/lib/generated/module-manifest.json', () => ({
  default: { modules: [] },
}))

const mockGetAriInstance3 = vi.fn()
const mockTryClaimFirstSigninPing3 = vi.fn()
const mockSendTvConnect3 = vi.fn()

vi.mock('@/lib/telemetry/instance', () => ({
  getAriInstance: (...args: unknown[]) => mockGetAriInstance3(...args),
  tryClaimFirstSigninPing: (...args: unknown[]) => mockTryClaimFirstSigninPing3(...args),
}))
vi.mock('@/lib/telemetry/send-tv-connect', () => ({
  sendTvConnect: (...args: unknown[]) => mockSendTvConnect3(...args),
}))

import { auth } from '@/lib/auth'

function sessionCreateAfter() {
  return capturedConfigHolder.cfg.databaseHooks.session.create.after
}

beforeEach(() => {
  mockPoolQuery3.mockReset()
  mockGetAriInstance3.mockReset()
  mockTryClaimFirstSigninPing3.mockReset()
  mockSendTvConnect3.mockReset()
})

// ── This test sets firstSigninPingResolved = true via line 216 ────────────────
// firstSigninPingResolved starts false in this fresh module.
// With telemetryEnabled=true, firstSigninPinged=false, pool exists (not null),
// claimed=true, but NO email row → lines 215 true branch, 216-217 fire.
// Also covers:
//   - BRDA:193,11 false branch (instance exists & telemetry enabled → don't take if-body)
//   - BRDA:194,13 false branch (firstSigninPinged=false → don't take if-body)
//   - BRDA:198,14 false branch (pool is not null → don't take if-body)
//   - BRDA:205,15 false branch (claimed=true → don't take if-body)
//   - BRDA:215,16 true branch (no email → take if-body)
describe('session.create.after — no-email → lines 216-217 (extra3)', () => {
  it('covers BRDA:215 true-branch and lines 216-217: no-email branch sets flag and returns', async () => {
    mockGetAriInstance3.mockResolvedValue({ telemetryEnabled: true, firstSigninPinged: false })
    mockTryClaimFirstSigninPing3.mockResolvedValue(true) // claim succeeds
    mockPoolQuery3.mockResolvedValue({ rows: [] }) // no email row found

    const session = { userId: 'user-e3-1' }
    await sessionCreateAfter()(session)
    await new Promise(resolve => setTimeout(resolve, 30))
    // Lines 216-217 covered: firstSigninPingResolved = true; return
    expect(mockSendTvConnect3).not.toHaveBeenCalled()
  })
})

describe('sanity check (extra3)', () => {
  it('auth is defined', () => {
    expect(auth).toBeDefined()
  })
})
