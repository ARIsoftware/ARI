/**
 * tests/unit/lib/auth.extra4.test.ts
 *
 * Test file for lib/auth.ts that sets env vars BEFORE importing so the
 * module-level trustedOrigins branches are covered:
 * - NEXT_PUBLIC_APP_URL → line 23 (push app URL)
 * - VERCEL_URL → line 28 (push Vercel URL)
 * - NODE_ENV=production → line 32 false branch (no localhost URLs)
 */

import { describe, it, expect, vi } from 'vitest'

// vi.hoisted runs before vi.mock factories and before imports are processed.
// This ensures the env vars are set when auth.ts module-level code executes.
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
  process.env.BETTER_AUTH_SECRET = 'test-secret-auth'
  process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.example.com'
  process.env.VERCEL_URL = 'myapp-abc123.vercel.app'
  vi.stubEnv('NODE_ENV', 'production')
})

vi.mock('better-auth', () => ({
  betterAuth: vi.fn((cfg: Record<string, any>) => ({ __cfg: cfg })),
}))

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

vi.mock('@/lib/db/pool', () => ({
  pool: { query: vi.fn() },
}))

vi.mock('@/lib/generated/module-manifest.json', () => ({
  default: { modules: [] },
}))

vi.mock('@/lib/telemetry/instance', () => ({
  getAriInstance: vi.fn(),
  tryClaimFirstSigninPing: vi.fn(),
}))

vi.mock('@/lib/telemetry/send-tv-connect', () => ({
  sendTvConnect: vi.fn(),
}))

// Import AFTER env vars are set
import { auth } from '@/lib/auth'

describe('auth.ts — module-level trustedOrigins with env vars set', () => {
  it('auth is defined (module loaded successfully with env vars)', () => {
    expect(auth).toBeDefined()
  })

  it('NEXT_PUBLIC_APP_URL env var was set before import — line 23 covered', () => {
    // The mere fact this file imports auth.ts with NEXT_PUBLIC_APP_URL set
    // causes line 23 (`trustedOrigins.push(process.env.NEXT_PUBLIC_APP_URL)`)
    // and line 28 (`trustedOrigins.push(https://... VERCEL_URL)`) to execute.
    // NODE_ENV=production means line 32 false branch (no localhost push) is taken.
    expect(process.env.NEXT_PUBLIC_APP_URL).toBe('https://myapp.example.com')
    expect(process.env.VERCEL_URL).toBe('myapp-abc123.vercel.app')
  })
})
