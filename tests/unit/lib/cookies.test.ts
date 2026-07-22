/**
 * tests/unit/lib/cookies.test.ts
 *
 * Tests for lib/cookies.ts — setSecureCookie.
 * Stubs document.cookie so we can inspect the produced cookie string.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// ── document stub ─────────────────────────────────────────────────────────────
let jar = ''
vi.stubGlobal('document', {
  set cookie(v: string) { jar = v },
  get cookie() { return jar },
})

// Now import the module under test.
import { setSecureCookie } from '@/lib/cookies'

afterEach(() => {
  jar = ''
  vi.unstubAllEnvs()
})

// ── helpers ───────────────────────────────────────────────────────────────────
function lastCookie() {
  return jar
}

// ── Basic encoding ─────────────────────────────────────────────────────────────

describe('setSecureCookie — basic encoding', () => {
  it('encodes name and value', () => {
    vi.stubEnv('NODE_ENV', 'development')
    setSecureCookie('my name', 'hello world')
    expect(lastCookie()).toMatch(/^my%20name=hello%20world/)
  })

  it('includes path=/ by default', () => {
    setSecureCookie('a', 'b')
    expect(lastCookie()).toContain('; path=/')
  })
})

// ── path option ───────────────────────────────────────────────────────────────

describe('setSecureCookie — path option', () => {
  it('sets a custom path', () => {
    setSecureCookie('a', 'b', { path: '/custom' })
    expect(lastCookie()).toContain('; path=/custom')
  })

  it('still includes path when explicitly set to /', () => {
    setSecureCookie('a', 'b', { path: '/' })
    expect(lastCookie()).toContain('; path=/')
  })
})

// ── maxAge option ─────────────────────────────────────────────────────────────

describe('setSecureCookie — maxAge option', () => {
  it('includes max-age when provided', () => {
    setSecureCookie('a', 'b', { maxAge: 3600 })
    expect(lastCookie()).toContain('; max-age=3600')
  })

  it('includes max-age=0 (explicit expiry)', () => {
    setSecureCookie('a', 'b', { maxAge: 0 })
    expect(lastCookie()).toContain('; max-age=0')
  })

  it('omits max-age when not provided', () => {
    setSecureCookie('a', 'b')
    expect(lastCookie()).not.toContain('max-age')
  })
})

// ── expires option ────────────────────────────────────────────────────────────

describe('setSecureCookie — expires option', () => {
  it('includes expires when a Date is provided', () => {
    const d = new Date('2030-01-01T00:00:00Z')
    setSecureCookie('a', 'b', { expires: d })
    expect(lastCookie()).toContain(`; expires=${d.toUTCString()}`)
  })

  it('omits expires when not provided', () => {
    setSecureCookie('a', 'b')
    expect(lastCookie()).not.toContain('expires')
  })
})

// ── domain option ─────────────────────────────────────────────────────────────

describe('setSecureCookie — domain option', () => {
  it('includes domain when provided', () => {
    setSecureCookie('a', 'b', { domain: 'example.com' })
    expect(lastCookie()).toContain('; domain=example.com')
  })

  it('omits domain when not provided', () => {
    setSecureCookie('a', 'b')
    expect(lastCookie()).not.toContain('domain')
  })
})

// ── secure option ──────────────────────────────────────────────────────────────
// NOTE: `isProduction` is evaluated at module load time (NODE_ENV is 'test' in
// this env), so we cannot change the default via vi.stubEnv after import.
// The `secure: isProduction` default branch is therefore not coverable without
// re-importing the module — it is reported as a genuinely-unreachable branch in
// the test env.  We cover the explicit-option path (which exercises the same
// if-guard) fully.

describe('setSecureCookie — secure flag', () => {
  it('omits secure when secure=false is passed explicitly', () => {
    setSecureCookie('a', 'b', { secure: false })
    expect(lastCookie()).not.toContain('; secure')
  })

  it('omits secure by default (NODE_ENV is not production at import time)', () => {
    // Default secure = isProduction = false in the test env
    setSecureCookie('a', 'b')
    expect(lastCookie()).not.toContain('; secure')
  })

  it('includes secure when explicitly passed secure=true', () => {
    setSecureCookie('a', 'b', { secure: true })
    expect(lastCookie()).toContain('; secure')
  })
})

// ── sameSite option ────────────────────────────────────────────────────────────

describe('setSecureCookie — sameSite option', () => {
  it('defaults to lax', () => {
    setSecureCookie('a', 'b')
    expect(lastCookie()).toContain('; samesite=lax')
  })

  it('can be set to strict', () => {
    setSecureCookie('a', 'b', { sameSite: 'strict' })
    expect(lastCookie()).toContain('; samesite=strict')
  })

  it('can be set to none', () => {
    setSecureCookie('a', 'b', { sameSite: 'none' })
    expect(lastCookie()).toContain('; samesite=none')
  })
})

// ── httpOnly option ────────────────────────────────────────────────────────────

describe('setSecureCookie — httpOnly option', () => {
  it('omits httponly by default', () => {
    setSecureCookie('a', 'b')
    expect(lastCookie()).not.toContain('httponly')
  })

  it('includes httponly when set to true', () => {
    setSecureCookie('a', 'b', { httpOnly: true })
    expect(lastCookie()).toContain('; httponly')
  })

  it('omits httponly when explicitly false', () => {
    setSecureCookie('a', 'b', { httpOnly: false })
    expect(lastCookie()).not.toContain('httponly')
  })
})

// ── combined options ───────────────────────────────────────────────────────────

describe('setSecureCookie — combined options', () => {
  it('produces a full cookie string with all options', () => {
    const expires = new Date('2030-06-01T00:00:00Z')
    setSecureCookie('token', 'abc123', {
      path: '/app',
      maxAge: 7200,
      expires,
      domain: 'ari.software',
      secure: true,
      sameSite: 'strict',
      httpOnly: true,
    })
    const c = lastCookie()
    expect(c).toContain('token=abc123')
    expect(c).toContain('; path=/app')
    expect(c).toContain('; max-age=7200')
    expect(c).toContain(`; expires=${expires.toUTCString()}`)
    expect(c).toContain('; domain=ari.software')
    expect(c).toContain('; secure')
    expect(c).toContain('; samesite=strict')
    expect(c).toContain('; httponly')
  })
})

// ── edge cases: falsy path and sameSite ──────────────────────────────────────
// These cover the false branches of `if (path)` and `if (sameSite)`.

describe('setSecureCookie — edge cases (falsy values)', () => {
  it('omits path when path is empty string (falsy)', () => {
    // path='' is falsy → if (path) false branch → no "; path=" in cookie
    setSecureCookie('a', 'b', { path: '' })
    expect(lastCookie()).not.toContain('; path=')
  })

  it('omits samesite when sameSite is empty string (falsy cast)', () => {
    // sameSite='' as any → if (sameSite) false branch → no "; samesite=" in cookie
    setSecureCookie('a', 'b', { sameSite: '' as any })
    expect(lastCookie()).not.toContain('; samesite=')
  })
})
