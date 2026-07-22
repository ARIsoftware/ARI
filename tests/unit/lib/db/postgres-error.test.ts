import { describe, it, expect } from 'vitest'
import { getPgCode } from '@/lib/db/postgres-error'

describe('getPgCode', () => {
  it('returns the code property from a plain object', () => {
    expect(getPgCode({ code: '42501' })).toBe('42501')
  })

  it('returns undefined when code is missing', () => {
    expect(getPgCode({ message: 'oops' })).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(getPgCode(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(getPgCode(undefined)).toBeUndefined()
  })

  it('returns undefined for a plain string', () => {
    expect(getPgCode('some error string')).toBeUndefined()
  })

  it('returns undefined for a number', () => {
    expect(getPgCode(42)).toBeUndefined()
  })

  it('works with an actual Error subclass that has a code', () => {
    const err = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
    expect(getPgCode(err)).toBe('ECONNREFUSED')
  })

  it('returns undefined for an empty object', () => {
    expect(getPgCode({})).toBeUndefined()
  })

  it('handles an object with code explicitly set to undefined', () => {
    expect(getPgCode({ code: undefined })).toBeUndefined()
  })
})
