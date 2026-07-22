import { describe, it, expect } from 'vitest'
import { classifyBootstrapError } from '@/lib/setup-error-dictionary'

describe('classifyBootstrapError — no_database', () => {
  it('returns NO_DATABASE when status is "no_database"', () => {
    const result = classifyBootstrapError('no_database', undefined, undefined)
    expect(result.code).toBe('no_database')
    expect(result.retryable).toBe(true)
    expect(result.reconfigurable).toBe(true)
  })
})

describe('classifyBootstrapError — rate_limited', () => {
  it('returns RATE_LIMITED when status is "rate_limited"', () => {
    const result = classifyBootstrapError('rate_limited', undefined, undefined)
    expect(result.code).toBe('rate_limited')
    expect(result.reconfigurable).toBe(false)
  })

  it('returns RATE_LIMITED when message includes "rate limit"', () => {
    const result = classifyBootstrapError(undefined, 'You have hit the rate limit', undefined)
    expect(result.code).toBe('rate_limited')
  })

  it('returns RATE_LIMITED when message includes "too many requests"', () => {
    const result = classifyBootstrapError(undefined, 'Too many requests from this IP', undefined)
    expect(result.code).toBe('rate_limited')
  })

  it('rate_limited check is case-insensitive', () => {
    const result = classifyBootstrapError(undefined, 'RATE LIMIT exceeded', undefined)
    expect(result.code).toBe('rate_limited')
  })
})

describe('classifyBootstrapError — role_missing', () => {
  it('returns ROLE_MISSING for pgCode 42704 with "role does not exist" message', () => {
    const result = classifyBootstrapError(undefined, 'role "anon" does not exist', '42704')
    expect(result.code).toBe('role_missing')
    expect(result.retryable).toBe(true)
  })

  it('does NOT return ROLE_MISSING when code is 42704 but message lacks "role"', () => {
    const result = classifyBootstrapError(undefined, '"anon" does not exist', '42704')
    expect(result.code).not.toBe('role_missing')
  })

  it('does NOT return ROLE_MISSING when code is 42704 but message lacks "does not exist"', () => {
    const result = classifyBootstrapError(undefined, 'role "anon" failed', '42704')
    expect(result.code).not.toBe('role_missing')
  })
})

describe('classifyBootstrapError — permission_denied', () => {
  it('returns PERMISSION_DENIED for pgCode 42501', () => {
    const result = classifyBootstrapError(undefined, '', '42501')
    expect(result.code).toBe('permission_denied')
  })

  it('returns PERMISSION_DENIED when message includes "permission denied"', () => {
    const result = classifyBootstrapError(undefined, 'permission denied for table users', undefined)
    expect(result.code).toBe('permission_denied')
  })

  it('permission_denied check is case-insensitive', () => {
    const result = classifyBootstrapError(undefined, 'Permission Denied', undefined)
    expect(result.code).toBe('permission_denied')
  })
})

describe('classifyBootstrapError — auth_failed', () => {
  it('returns AUTH_FAILED for pgCode 28P01', () => {
    const result = classifyBootstrapError(undefined, '', '28P01')
    expect(result.code).toBe('auth_failed')
  })

  it('returns AUTH_FAILED for pgCode 28000', () => {
    const result = classifyBootstrapError(undefined, '', '28000')
    expect(result.code).toBe('auth_failed')
  })

  it('returns AUTH_FAILED when message includes "password authentication failed"', () => {
    const result = classifyBootstrapError(undefined, 'password authentication failed for user "app"', undefined)
    expect(result.code).toBe('auth_failed')
  })

  it('returns AUTH_FAILED when message includes "authentication failed"', () => {
    const result = classifyBootstrapError(undefined, 'authentication failed', undefined)
    expect(result.code).toBe('auth_failed')
  })

  it('auth_failed check is case-insensitive', () => {
    const result = classifyBootstrapError(undefined, 'Authentication Failed', undefined)
    expect(result.code).toBe('auth_failed')
  })
})

describe('classifyBootstrapError — connection_refused', () => {
  const connectionMessages = [
    'connect ECONNREFUSED 127.0.0.1:5432',
    'getaddrinfo ENOTFOUND db.example.com',
    'connect ETIMEDOUT',
    'connection refused',
    'could not connect to the database',
    'connection terminated unexpectedly',
  ]

  for (const msg of connectionMessages) {
    it(`returns CONNECTION_REFUSED for message: "${msg}"`, () => {
      const result = classifyBootstrapError(undefined, msg, undefined)
      expect(result.code).toBe('connection_refused')
    })
  }

  it('connection_refused check is case-insensitive', () => {
    const result = classifyBootstrapError(undefined, 'Connection Refused', undefined)
    expect(result.code).toBe('connection_refused')
  })
})

describe('classifyBootstrapError — transient', () => {
  it('returns TRANSIENT for status "install_failed"', () => {
    const result = classifyBootstrapError('install_failed', undefined, undefined)
    expect(result.code).toBe('transient')
    expect(result.retryable).toBe(true)
    expect(result.reconfigurable).toBe(true)
  })

  it('returns TRANSIENT for status "error"', () => {
    const result = classifyBootstrapError('error', undefined, undefined)
    expect(result.code).toBe('transient')
  })
})

describe('classifyBootstrapError — unknown', () => {
  it('returns UNKNOWN for undefined status and empty message and no pgCode', () => {
    const result = classifyBootstrapError(undefined, undefined, undefined)
    expect(result.code).toBe('unknown')
    expect(result.retryable).toBe(true)
    expect(result.reconfigurable).toBe(true)
  })

  it('returns UNKNOWN for unrecognized status with no matching message', () => {
    const result = classifyBootstrapError('already_initialized', 'all good', undefined)
    expect(result.code).toBe('unknown')
  })

  it('UNKNOWN has the expected structure', () => {
    const result = classifyBootstrapError(undefined, undefined, undefined)
    expect(typeof result.title).toBe('string')
    expect(typeof result.summary).toBe('string')
    expect(typeof result.diagnosis).toBe('string')
    expect(Array.isArray(result.actions)).toBe(true)
    expect(result.actions.length).toBeGreaterThan(0)
    for (const action of result.actions) {
      expect(typeof action.heading).toBe('string')
      expect(typeof action.body).toBe('string')
    }
  })
})

describe('classifyBootstrapError — priority ordering', () => {
  it('no_database wins over rate_limited message', () => {
    // status=no_database should short-circuit before rate_limited check
    const result = classifyBootstrapError('no_database', 'rate limit exceeded', undefined)
    expect(result.code).toBe('no_database')
  })

  it('rate_limited wins over role_missing pgCode+message', () => {
    const result = classifyBootstrapError(
      'rate_limited',
      'role "anon" does not exist',
      '42704',
    )
    expect(result.code).toBe('rate_limited')
  })
})
