import { describe, it, expect } from 'vitest'
import { isUniqueViolation } from '@/modules-core/portfolio/lib/pg-errors'

describe('isUniqueViolation', () => {
  it('detects a direct unique-violation code', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('detects the code on a wrapped cause', () => {
    const err = new Error('query failed')
    ;(err as Error & { cause?: unknown }).cause = { code: '23505' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('walks multiple levels of cause', () => {
    const inner = { code: '23505' }
    const mid = new Error('mid')
    ;(mid as Error & { cause?: unknown }).cause = inner
    const outer = new Error('outer')
    ;(outer as Error & { cause?: unknown }).cause = mid
    expect(isUniqueViolation(outer)).toBe(true)
  })

  it('stops walking after five levels', () => {
    let chain: Record<string, unknown> = { code: '23505' }
    for (let i = 0; i < 6; i++) {
      chain = { cause: chain }
    }
    expect(isUniqueViolation(chain)).toBe(false)
  })

  it('returns false for other SQLSTATE codes', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
  })

  it('returns false for non-object values', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('23505')).toBe(false)
    expect(isUniqueViolation(new Error('plain'))).toBe(false)
  })
})
