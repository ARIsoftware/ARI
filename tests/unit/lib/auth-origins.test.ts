import { describe, it, expect } from 'vitest'
import { isPrivateAddressHost, privateNetworkTrustedOrigins } from '@/lib/auth-origins'

describe('isPrivateAddressHost', () => {
  it('accepts loopback and private IPv4 literals', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.5',
      '192.168.1.42',
      '172.16.0.1',
      '172.31.255.254',
      '169.254.1.1',
    ]) {
      expect(isPrivateAddressHost(host), host).toBe(true)
    }
  })

  it('rejects public IPv4 and out-of-range 172 blocks', () => {
    for (const host of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '11.0.0.1']) {
      expect(isPrivateAddressHost(host), host).toBe(false)
    }
  })

  it('rejects malformed IPv4 octets', () => {
    for (const host of ['999.168.2.1', '192.999.2.1', '192.168.999.1', '192.168.2.999']) {
      expect(isPrivateAddressHost(host), host).toBe(false)
    }
  })

  it('accepts private IPv6 literals, bracketed or bare', () => {
    for (const host of ['::1', '[::1]', 'fd00::1', 'fc00::1', 'FE80::1', '[fd12:3456::7]']) {
      expect(isPrivateAddressHost(host), host).toBe(true)
    }
  })

  it('rejects public IPv6', () => {
    expect(isPrivateAddressHost('2001:4860:4860::8888')).toBe(false)
  })

  it('rejects DNS names, including ones that could be rebound to a private IP', () => {
    for (const host of [
      '',
      'example.com',
      'rebind.attacker.com',
      'ari.local',
      'macbook',
      'localhost.attacker.com',
    ]) {
      expect(isPrivateAddressHost(host), host).toBe(false)
    }
  })
})

describe('privateNetworkTrustedOrigins', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://192.168.1.42:3000/api/auth/sign-in/email', { headers })

  it('returns nothing without a request', () => {
    expect(privateNetworkTrustedOrigins(undefined)).toEqual([])
    expect(privateNetworkTrustedOrigins(null)).toEqual([])
  })

  it('returns nothing when no origin or referer is present', () => {
    expect(privateNetworkTrustedOrigins(req({}))).toEqual([])
  })

  it('trusts a private LAN origin header', () => {
    expect(privateNetworkTrustedOrigins(req({ origin: 'http://192.168.1.42:3000' }))).toEqual([
      'http://192.168.1.42:3000',
    ])
  })

  it('falls back to referer and returns only its origin', () => {
    expect(privateNetworkTrustedOrigins(req({ referer: 'http://10.0.0.5:3000/sign-in?x=1' }))).toEqual(
      ['http://10.0.0.5:3000'],
    )
  })

  it('prefers origin over referer', () => {
    const headers = { origin: 'http://192.168.1.42:3000', referer: 'http://10.0.0.5:3000/x' }
    expect(privateNetworkTrustedOrigins(req(headers))).toEqual(['http://192.168.1.42:3000'])
  })

  it('skips a literal "null" origin and falls through to referer', () => {
    const headers = { origin: 'null', referer: 'http://127.0.0.1:3000/sign-in' }
    expect(privateNetworkTrustedOrigins(req(headers))).toEqual(['http://127.0.0.1:3000'])
  })

  it('ignores public and non-http origins', () => {
    expect(privateNetworkTrustedOrigins(req({ origin: 'https://evil.com' }))).toEqual([])
    expect(privateNetworkTrustedOrigins(req({ origin: 'file://' }))).toEqual([])
    expect(privateNetworkTrustedOrigins(req({ origin: 'not a url' }))).toEqual([])
  })

  it('ignores a rebinding hostname even when it resolves to a private IP', () => {
    expect(privateNetworkTrustedOrigins(req({ origin: 'http://rebind.attacker.com' }))).toEqual([])
  })
})
