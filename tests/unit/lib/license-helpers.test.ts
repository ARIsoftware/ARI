import { describe, it, expect } from 'vitest'
import {
  LICENSE_MODULE_ID,
  MODULES_API_BASE,
  buildClientInfo,
  LICENSE_CACHE_KEY,
  LIBRARY_CACHE_KEY,
  CACHE_TTL,
} from '@/lib/license-helpers'

describe('constants', () => {
  it('LICENSE_MODULE_ID is "__license__"', () => {
    expect(LICENSE_MODULE_ID).toBe('__license__')
  })

  it('MODULES_API_BASE is the ari.software API base URL', () => {
    expect(MODULES_API_BASE).toBe('https://api.ari.software')
  })

  it('LICENSE_CACHE_KEY is a non-empty string', () => {
    expect(typeof LICENSE_CACHE_KEY).toBe('string')
    expect(LICENSE_CACHE_KEY.length).toBeGreaterThan(0)
  })

  it('LIBRARY_CACHE_KEY is a non-empty string', () => {
    expect(typeof LIBRARY_CACHE_KEY).toBe('string')
    expect(LIBRARY_CACHE_KEY.length).toBeGreaterThan(0)
  })

  it('CACHE_TTL is 5 minutes in milliseconds', () => {
    expect(CACHE_TTL).toBe(5 * 60 * 1000)
  })
})

describe('buildClientInfo', () => {
  it('returns an object with ari_version, platform, and timestamp', () => {
    const info = buildClientInfo()
    expect(typeof info.ari_version).toBe('string')
    expect(typeof info.platform).toBe('string')
    expect(typeof info.timestamp).toBe('string')
  })

  it('timestamp is a valid ISO 8601 date string', () => {
    const { timestamp } = buildClientInfo()
    expect(() => new Date(timestamp).toISOString()).not.toThrow()
    expect(new Date(timestamp).toISOString()).toBe(timestamp)
  })

  it('platform is one of darwin, windows, linux', () => {
    const { platform } = buildClientInfo()
    expect(['darwin', 'windows', 'linux']).toContain(platform)
  })

  it('ari_version falls back to "0.0.0" when env var is not set', () => {
    const saved = process.env.NEXT_PUBLIC_ARI_VERSION
    delete process.env.NEXT_PUBLIC_ARI_VERSION
    expect(buildClientInfo().ari_version).toBe('0.0.0')
    if (saved !== undefined) process.env.NEXT_PUBLIC_ARI_VERSION = saved
  })

  it('ari_version uses NEXT_PUBLIC_ARI_VERSION when set', () => {
    const saved = process.env.NEXT_PUBLIC_ARI_VERSION
    process.env.NEXT_PUBLIC_ARI_VERSION = '2.3.4'
    expect(buildClientInfo().ari_version).toBe('2.3.4')
    if (saved !== undefined) process.env.NEXT_PUBLIC_ARI_VERSION = saved
    else delete process.env.NEXT_PUBLIC_ARI_VERSION
  })

  it('generates a fresh timestamp on each call', async () => {
    const t1 = buildClientInfo().timestamp
    await new Promise((r) => setTimeout(r, 2))
    const t2 = buildClientInfo().timestamp
    // Both should be valid ISO strings; order: t1 <= t2
    expect(new Date(t1).getTime()).toBeLessThanOrEqual(new Date(t2).getTime())
  })
})
