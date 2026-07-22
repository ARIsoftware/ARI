import { describe, it, expect, afterEach, vi } from 'vitest'
import { safeErrorResponse } from '@/lib/api-error'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('safeErrorResponse — non-production', () => {
  it('returns error message in non-production with an Error object', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(safeErrorResponse(new Error('boom'))).toBe('boom')
  })

  it('returns "Internal server error" in non-production when value is not an Error', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(safeErrorResponse('some string')).toBe('Internal server error')
    expect(safeErrorResponse(null)).toBe('Internal server error')
    expect(safeErrorResponse(42)).toBe('Internal server error')
    expect(safeErrorResponse(undefined)).toBe('Internal server error')
    expect(safeErrorResponse({ message: 'obj' })).toBe('Internal server error')
  })

  it('returns the Error message in test environment (also non-production)', () => {
    // NODE_ENV=test is set by vitest and is != 'production'
    expect(safeErrorResponse(new Error('test error'))).toBe('test error')
  })
})

describe('safeErrorResponse — production', () => {
  it('always returns "Internal server error" regardless of error type', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(safeErrorResponse(new Error('secret detail'))).toBe('Internal server error')
    expect(safeErrorResponse('raw string')).toBe('Internal server error')
    expect(safeErrorResponse(null)).toBe('Internal server error')
  })
})
