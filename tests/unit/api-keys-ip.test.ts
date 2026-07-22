// Set a dummy DATABASE_URL before importing lib/api-keys, which imports lib/db.
// The pg pool is lazy-connecting, so it won't actually connect during tests.
process.env.DATABASE_URL = 'postgresql://localhost:5432/test'

import { describe, it, expect } from 'vitest'
import { checkIpAllowed } from '@/lib/api-keys'

describe('checkIpAllowed — null/empty allowlist', () => {
  it('returns true when allowedIps is null', () => {
    expect(checkIpAllowed(null, '1.2.3.4')).toBe(true)
  })

  it('returns true when allowedIps is an empty array', () => {
    expect(checkIpAllowed([], '1.2.3.4')).toBe(true)
  })

  it('returns true regardless of request IP when allowlist is null', () => {
    expect(checkIpAllowed(null, null)).toBe(true)
  })
})

describe('checkIpAllowed — null request IP', () => {
  it('returns false when allowedIps is non-empty and requestIp is null', () => {
    expect(checkIpAllowed(['1.2.3.4'], null)).toBe(false)
  })
})

describe('checkIpAllowed — exact match', () => {
  it('returns true for an exact IP match', () => {
    expect(checkIpAllowed(['1.2.3.4'], '1.2.3.4')).toBe(true)
  })

  it('returns false for a non-matching IP', () => {
    expect(checkIpAllowed(['1.2.3.4'], '1.2.3.5')).toBe(false)
  })
})

describe('checkIpAllowed — CIDR', () => {
  it('returns true for an IP within the CIDR block', () => {
    expect(checkIpAllowed(['10.0.0.0/8'], '10.1.2.3')).toBe(true)
  })

  it('returns false for an IP outside the CIDR block', () => {
    expect(checkIpAllowed(['10.0.0.0/8'], '11.0.0.1')).toBe(false)
  })
})

describe('checkIpAllowed — IPv6-mapped IPv4', () => {
  it('normalizes ::ffff: prefix before matching', () => {
    // normalizeIp strips ::ffff: prefix, so ::ffff:1.2.3.4 → 1.2.3.4
    expect(checkIpAllowed(['1.2.3.4'], '::ffff:1.2.3.4')).toBe(true)
  })
})

describe('checkIpAllowed — CIDR edge cases', () => {
  it('returns false for CIDR with invalid bits (isNaN(bits) branch)', () => {
    // '10.0.0.0/invalid' → parseInt('invalid', 10) = NaN → isNaN → false
    expect(checkIpAllowed(['10.0.0.0/invalid'], '10.0.0.1')).toBe(false)
  })

  it('returns false when IP is IPv6 and CIDR is IPv4 (ipToNumber returns null)', () => {
    // IPv6 can't be converted to a number → ipNum === null → false
    expect(checkIpAllowed(['10.0.0.0/8'], '2001:db8::1')).toBe(false)
  })

  it('returns true for /0 CIDR (bits === 0 → mask = 0, matches everything)', () => {
    // bits === 0 → mask = 0 → (ipNum & 0) === (rangeNum & 0) → 0 === 0 → true
    expect(checkIpAllowed(['0.0.0.0/0'], '1.2.3.4')).toBe(true)
  })

  it('returns false when requestIp is IPv6 pure (non-mapped) — not IPv4', () => {
    // ::1 is the IPv6 loopback; ipToNumber returns null for non-4-part IPs
    expect(checkIpAllowed(['127.0.0.0/8'], '::1')).toBe(false)
  })

  it('returns false for CIDR with out-of-range octet in range address', () => {
    // '999.0.0.0/8' → ipToNumber('999.0.0.0') returns null → false
    expect(checkIpAllowed(['999.0.0.0/8'], '10.0.0.1')).toBe(false)
  })

  it('returns false when IP has a non-numeric octet', () => {
    // 'abc.0.0.1' → parseInt('abc') = NaN → ipToNumber returns null
    expect(checkIpAllowed(['10.0.0.0/8'], 'abc.0.0.1')).toBe(false)
  })

  it('returns false for exact match when allowed IP has invalid octet', () => {
    // normalizeIp('256.0.0.1') returns '256.0.0.1'; exact string comparison fails
    expect(checkIpAllowed(['256.0.0.1'], '10.0.0.1')).toBe(false)
  })
})
