/**
 * Tests for lib/modules/public-route-security.ts
 *
 * Covers the module's exported surface: the in-memory rate limiter, the
 * same-origin gate, and client-IP extraction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The module uses a module-level setInterval. We fake timers to avoid
// real intervals in the test suite.
vi.useFakeTimers()

import {
  checkRateLimit,
  isSameOriginRequest,
  getClientIp,
} from '@/lib/modules/public-route-security'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRequest(options: {
  origin?: string
  referer?: string
  requestUrl?: string
  xForwardedFor?: string
  xRealIp?: string
}) {
  const headers = new Map<string, string>()
  if (options.origin) headers.set('origin', options.origin)
  if (options.referer) headers.set('referer', options.referer)
  if (options.xForwardedFor) headers.set('x-forwarded-for', options.xForwardedFor)
  if (options.xRealIp) headers.set('x-real-ip', options.xRealIp)

  const url = options.requestUrl ?? 'http://localhost:3000/api/test'

  return {
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    nextUrl: {
      origin: new URL(url).origin,
    },
  } as any
}

// ── checkRateLimit ────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('allows first request for a new identifier', () => {
    expect(checkRateLimit('test-id-1', 10)).toBe(true)
  })

  it('allows subsequent requests within the limit', () => {
    const id = `rate-limit-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(id, 10)).toBe(true)
    }
  })

  it('blocks requests that exceed the limit within the window', () => {
    const id = `rate-limit-block-${Date.now()}-${Math.random()}`
    // Send exactly maxRequests
    for (let i = 0; i < 3; i++) {
      checkRateLimit(id, 3)
    }
    // Next request should be blocked
    expect(checkRateLimit(id, 3)).toBe(false)
  })

  it('resets the window after 1 minute', () => {
    const id = `rate-limit-reset-${Date.now()}-${Math.random()}`
    // Fill the window
    for (let i = 0; i < 2; i++) checkRateLimit(id, 2)
    expect(checkRateLimit(id, 2)).toBe(false) // over limit

    // Advance time past the window
    vi.advanceTimersByTime(61 * 1000)

    // Should be reset — first request of new window is allowed
    expect(checkRateLimit(id, 2)).toBe(true)
  })

  it('different identifiers have independent limits', () => {
    const id1 = `rate-a-${Date.now()}-${Math.random()}`
    const id2 = `rate-b-${Date.now()}-${Math.random()}`
    for (let i = 0; i < 2; i++) checkRateLimit(id1, 2)
    expect(checkRateLimit(id1, 2)).toBe(false)
    // id2 is untouched
    expect(checkRateLimit(id2, 2)).toBe(true)
  })
})

// ── isSameOriginRequest ────────────────────────────────────────────────────────

describe('isSameOriginRequest', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = savedEnv.NEXT_PUBLIC_APP_URL
    process.env.BETTER_AUTH_URL = savedEnv.BETTER_AUTH_URL
  })

  it('returns true when origin matches nextUrl.origin', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'http://localhost:3000/api/test',
      origin: 'http://localhost:3000',
    })
    expect(isSameOriginRequest(req)).toBe(true)
  })

  it('returns false when origin is from a different site', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'http://localhost:3000/api/test',
      origin: 'https://evil.example.com',
    })
    expect(isSameOriginRequest(req)).toBe(false)
  })

  it('returns true when referer matches nextUrl.origin', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'http://localhost:3000/api/test',
      referer: 'http://localhost:3000/setup',
    })
    expect(isSameOriginRequest(req)).toBe(true)
  })

  it('returns false when referer is from a different site', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'http://localhost:3000/api/test',
      referer: 'https://attacker.example.com/page',
    })
    expect(isSameOriginRequest(req)).toBe(false)
  })

  it('returns false when neither origin nor referer is present', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({ requestUrl: 'http://localhost:3000/api/test' })
    expect(isSameOriginRequest(req)).toBe(false)
  })

  it('trusts NEXT_PUBLIC_APP_URL env var as a valid origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.example.com'
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'https://myapp.example.com/api/test',
      origin: 'https://myapp.example.com',
    })
    expect(isSameOriginRequest(req)).toBe(true)
  })

  it('trusts BETTER_AUTH_URL env var as a valid origin', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.BETTER_AUTH_URL = 'https://auth.example.com'
    const req = makeRequest({
      requestUrl: 'https://auth.example.com/api/test',
      origin: 'https://auth.example.com',
    })
    expect(isSameOriginRequest(req)).toBe(true)
  })

  it('ignores malformed env var URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'not-a-valid-url'
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'http://localhost:3000/api/test',
      origin: 'not-a-valid-url',
    })
    // Should not throw; malformed URL is silently skipped
    expect(() => isSameOriginRequest(req)).not.toThrow()
  })

  it('handles malformed referer gracefully', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'http://localhost:3000/api/test',
      referer: 'not-a-url',
    })
    expect(isSameOriginRequest(req)).toBe(false)
  })
})

// ── getClientIp ───────────────────────────────────────────────────────────────

describe('getClientIp', () => {
  it('returns first IP from x-forwarded-for when multiple are present', () => {
    const req = makeRequest({ xForwardedFor: '1.2.3.4, 5.6.7.8, 9.10.11.12' })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('returns IP from x-forwarded-for when single', () => {
    const req = makeRequest({ xForwardedFor: '203.0.113.1' })
    expect(getClientIp(req)).toBe('203.0.113.1')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = makeRequest({ xRealIp: '10.0.0.1' })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  it('returns "unknown" when neither header is present', () => {
    const req = makeRequest({})
    expect(getClientIp(req)).toBe('unknown')
  })

  it('trims whitespace around IPs in x-forwarded-for', () => {
    const req = makeRequest({ xForwardedFor: '  192.168.1.1 , 10.0.0.1' })
    expect(getClientIp(req)).toBe('192.168.1.1')
  })
})

// ── setInterval cleanup ────────────────────────────────────────────────────────

describe('module-level setInterval cleanup callback', () => {
  it('fires after 5 minutes and removes expired rate-limit entries', async () => {
    // The module-level setInterval is cleared by clearAllTimers() in previous
    // afterEach blocks. We re-import the module fresh with fake timers active
    // so a new setInterval gets registered and we can fire it.
    vi.useFakeTimers()
    vi.resetModules()

    const { checkRateLimit: freshCheckRateLimit } = await import('@/lib/modules/public-route-security')
    const id = `cleanup-setinterval-${Math.random()}`

    // Create a rate-limit entry
    vi.setSystemTime(new Date('2025-06-01T00:00:00.000Z'))
    freshCheckRateLimit(id, 3)

    // Advance past 2 minutes (> windowMs * 2) so the entry is stale
    vi.advanceTimersByTime(2 * 60 * 1000 + 1000)

    // Advance to trigger the setInterval (5 minutes total)
    vi.advanceTimersByTime(3 * 60 * 1000)

    // The cleanup callback fired and deleted the stale entry.
    // A fresh call should start a new window (true, not blocked).
    expect(freshCheckRateLimit(id, 3)).toBe(true)

    vi.useRealTimers()
  })
})

describe('isSameOriginRequest — env var origin match via referer', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = savedEnv.NEXT_PUBLIC_APP_URL
    process.env.BETTER_AUTH_URL = savedEnv.BETTER_AUTH_URL
  })

  it('returns true when NEXT_PUBLIC_APP_URL matches the referer origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
    delete process.env.BETTER_AUTH_URL
    const req = makeRequest({
      requestUrl: 'https://app.example.com/api/test',
      referer: 'https://app.example.com/dashboard',
    })
    expect(isSameOriginRequest(req)).toBe(true)
  })

  it('returns true when BETTER_AUTH_URL matches the referer origin', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.BETTER_AUTH_URL = 'https://auth.myapp.io'
    const req = makeRequest({
      requestUrl: 'https://auth.myapp.io/api/test',
      referer: 'https://auth.myapp.io/sign-in',
    })
    expect(isSameOriginRequest(req)).toBe(true)
  })
})
