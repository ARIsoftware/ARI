import { describe, it, expect } from 'vitest'
import { PUBLIC_ROUTE_PREFIXES, isPublicPathname } from '@/lib/route-helpers'

describe('PUBLIC_ROUTE_PREFIXES', () => {
  it('contains /sign-in, /welcome, and /database-error', () => {
    expect(PUBLIC_ROUTE_PREFIXES).toContain('/sign-in')
    expect(PUBLIC_ROUTE_PREFIXES).toContain('/welcome')
    expect(PUBLIC_ROUTE_PREFIXES).toContain('/database-error')
  })
})

describe('isPublicPathname', () => {
  it('returns true for /sign-in', () => {
    expect(isPublicPathname('/sign-in')).toBe(true)
  })

  it('returns true for /sign-in/verify (sub-path)', () => {
    expect(isPublicPathname('/sign-in/verify')).toBe(true)
  })

  it('returns true for /welcome', () => {
    expect(isPublicPathname('/welcome')).toBe(true)
  })

  it('returns true for /welcome/step-2', () => {
    expect(isPublicPathname('/welcome/step-2')).toBe(true)
  })

  it('returns true for /database-error', () => {
    expect(isPublicPathname('/database-error')).toBe(true)
  })

  it('returns false for /dashboard (private route)', () => {
    expect(isPublicPathname('/dashboard')).toBe(false)
  })

  it('returns false for /tasks', () => {
    expect(isPublicPathname('/tasks')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isPublicPathname('')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isPublicPathname(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isPublicPathname(undefined)).toBe(false)
  })

  it('returns false for a path that merely contains a public prefix mid-string', () => {
    expect(isPublicPathname('/api/sign-in')).toBe(false)
  })
})
