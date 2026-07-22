import { describe, it, expect, afterEach } from 'vitest'
import {
  hasSessionCookie,
  hasApiKeyHeader,
  BETTER_AUTH_COOKIE_NAME,
  API_KEY_PREFIX,
} from '@/lib/auth-middleware'

// The module reads process.env.NODE_ENV at module load time, so we need to test
// both environments by manipulating the env and re-importing, OR by testing the
// function's behaviour (which branches on isProduction). Since isProduction is a
// module-level constant we can't change it after import; instead we cover the two
// cookie-name branches by using the correct cookie name for the current env
// (NODE_ENV=test, so isProduction=false, meaning BETTER_AUTH_COOKIE_NAME is used).

const SECURE_COOKIE_NAME = `__Secure-${BETTER_AUTH_COOKIE_NAME}`

function makeCookies(entries: Record<string, string>) {
  return {
    get: (name: string) =>
      name in entries ? { value: entries[name] } : undefined,
  }
}

function makeHeaders(entries: Record<string, string | null>) {
  return {
    get: (name: string) => entries[name] ?? null,
  }
}

const VALID_TOKEN = 'a'.repeat(40) // 40 chars >= MIN_TOKEN_LENGTH (32)
const VALID_API_KEY = `${API_KEY_PREFIX}${'b'.repeat(64)}` // ari_k_ + 64 = 70 chars

// ─── hasSessionCookie ─────────────────────────────────────────────────────

describe('hasSessionCookie — non-production (test env uses plain cookie name)', () => {
  it('returns true for a valid token in the plain cookie', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: VALID_TOKEN })
    expect(hasSessionCookie(cookies)).toBe(true)
  })

  it('returns false when the cookie is absent', () => {
    expect(hasSessionCookie(makeCookies({}))).toBe(false)
  })

  it('returns false when the cookie value is empty string', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: '' })
    expect(hasSessionCookie(cookies)).toBe(false)
  })

  it('returns false when the token is too short (< 32 chars)', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: 'short' })
    expect(hasSessionCookie(cookies)).toBe(false)
  })

  it('returns false when the token is exactly MIN_TOKEN_LENGTH - 1', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: 'a'.repeat(31) })
    expect(hasSessionCookie(cookies)).toBe(false)
  })

  it('returns true when the token is exactly MIN_TOKEN_LENGTH (32)', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: 'a'.repeat(32) })
    expect(hasSessionCookie(cookies)).toBe(true)
  })

  it('returns false when the token contains a null byte', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: VALID_TOKEN + '\0' })
    expect(hasSessionCookie(cookies)).toBe(false)
  })

  it('returns false when the token contains a newline', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: VALID_TOKEN + '\n' })
    expect(hasSessionCookie(cookies)).toBe(false)
  })

  it('returns false when the token contains a carriage return', () => {
    const cookies = makeCookies({ [BETTER_AUTH_COOKIE_NAME]: VALID_TOKEN + '\r' })
    expect(hasSessionCookie(cookies)).toBe(false)
  })

  it('does not check the __Secure- cookie in non-production', () => {
    // Provide a valid token only under the secure name — should NOT match in dev
    const cookies = makeCookies({ [SECURE_COOKIE_NAME]: VALID_TOKEN })
    expect(hasSessionCookie(cookies)).toBe(false)
  })
})

// ─── hasApiKeyHeader ──────────────────────────────────────────────────────

describe('hasApiKeyHeader', () => {
  it('returns false when the header is absent', () => {
    expect(hasApiKeyHeader(makeHeaders({}))).toBe(false)
  })

  it('returns false when the header is null', () => {
    expect(hasApiKeyHeader(makeHeaders({ 'x-api-key': null }))).toBe(false)
  })

  it('returns false when the key does not start with the prefix', () => {
    expect(hasApiKeyHeader(makeHeaders({ 'x-api-key': 'sk_' + 'x'.repeat(64) }))).toBe(false)
  })

  it('returns false when the key starts with the prefix but is too short', () => {
    // MIN_API_KEY_LENGTH is 38; prefix is 6 chars, so we need >= 32 more
    const short = `${API_KEY_PREFIX}${'x'.repeat(31)}` // 37 chars total
    expect(hasApiKeyHeader(makeHeaders({ 'x-api-key': short }))).toBe(false)
  })

  it('returns true for a valid-format API key (prefix + >= 32 extra chars)', () => {
    expect(hasApiKeyHeader(makeHeaders({ 'x-api-key': VALID_API_KEY }))).toBe(true)
  })

  it('returns true when key is exactly MIN_API_KEY_LENGTH (38 chars)', () => {
    // ari_k_ = 6 chars, so we need 32 more for exactly 38
    const exact = `${API_KEY_PREFIX}${'x'.repeat(32)}`
    expect(hasApiKeyHeader(makeHeaders({ 'x-api-key': exact }))).toBe(true)
  })

  it('API_KEY_PREFIX is "ari_k_"', () => {
    expect(API_KEY_PREFIX).toBe('ari_k_')
  })
})

// ── hasSessionCookie — production branch ──────────────────────────────────────
// NODE_ENV is captured as a module-level constant at import time. We test
// the production code path by resetting modules and re-importing with
// NODE_ENV=production before the import resolves.

describe('hasSessionCookie — production (re-import with NODE_ENV=production)', () => {
  it('returns true for __Secure- cookie in production env', async () => {
    const { vi: _vi } = await import('vitest')
    _vi.stubEnv('NODE_ENV', 'production')

    // Reset and re-import so isProduction captures 'production'
    _vi.resetModules()
    const { hasSessionCookie: prodFn, BETTER_AUTH_COOKIE_NAME: cookieName } =
      await import('@/lib/auth-middleware')

    const secureName = `__Secure-${cookieName}`
    const cookies = makeCookies({ [secureName]: VALID_TOKEN })
    expect(prodFn(cookies)).toBe(true)

    // Restore
    _vi.unstubAllEnvs()
    _vi.resetModules()
  })

  it('returns false for plain cookie in production env (only __Secure- accepted)', async () => {
    const { vi: _vi } = await import('vitest')
    _vi.stubEnv('NODE_ENV', 'production')

    _vi.resetModules()
    const { hasSessionCookie: prodFn, BETTER_AUTH_COOKIE_NAME: cookieName } =
      await import('@/lib/auth-middleware')

    const cookies = makeCookies({ [cookieName]: VALID_TOKEN })
    // In production, only __Secure- cookie is checked → plain cookie → false
    expect(prodFn(cookies)).toBe(false)

    _vi.unstubAllEnvs()
    _vi.resetModules()
  })
})
