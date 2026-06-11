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
