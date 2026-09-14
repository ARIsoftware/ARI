import { describe, it, expect } from 'vitest'
import { getErrorMessages, getPgCode, getPgError } from '@/lib/db/postgres-error'

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

  it('looks through a Drizzle-style wrapper to the pg error on cause', () => {
    const pg = Object.assign(new Error('permission denied for table t'), { code: '42501' })
    const wrapped = Object.assign(new Error('Failed query: SELECT 1\nparams: '), { cause: pg })
    expect(getPgCode(wrapped)).toBe('42501')
    const doubly = Object.assign(new Error('outer'), { cause: wrapped })
    expect(getPgCode(doubly)).toBe('42501')
  })

  it('prefers the outermost code when several levels carry one', () => {
    const inner = Object.assign(new Error('inner'), { code: '42P01' })
    const outer = Object.assign(new Error('outer'), { code: '57P01', cause: inner })
    expect(getPgCode(outer)).toBe('57P01')
  })

  it('stops on a cause cycle or a non-object cause', () => {
    const a: Record<string, unknown> = { message: 'a' }
    a.cause = a
    expect(getPgCode(a)).toBeUndefined()
    expect(getPgCode({ message: 'x', cause: 'string cause' })).toBeUndefined()
  })
})

describe('getPgError', () => {
  it('returns the object carrying the SQLSTATE, wherever it sits in the chain', () => {
    const pg = { code: '42501', message: 'permission denied for table t' }
    expect(getPgError({ message: 'Failed query', cause: pg })).toBe(pg)
    expect(getPgError(pg)).toBe(pg)
  })

  it('falls back to the error itself when nothing in the chain has a code', () => {
    const err = new Error('no code anywhere')
    expect(getPgError(err)).toBe(err)
    expect(getPgError({ message: 'wrapper', cause: new Error('inner') })).toMatchObject({ message: 'wrapper' })
  })

  it('returns null for non-objects', () => {
    expect(getPgError(null)).toBeNull()
    expect(getPgError(undefined)).toBeNull()
    expect(getPgError('str')).toBeNull()
    expect(getPgError(42)).toBeNull()
  })
})

describe('getErrorMessages', () => {
  it('collects every message along the cause chain, outermost first', () => {
    const inner = new Error('Connection terminated unexpectedly')
    const wrapped = Object.assign(new Error('Failed query: SELECT 1'), { cause: inner })
    expect(getErrorMessages(wrapped)).toEqual(['Failed query: SELECT 1', 'Connection terminated unexpectedly'])
  })

  it('skips levels without a string message and tolerates non-objects', () => {
    expect(getErrorMessages({ cause: { message: 'deep' } })).toEqual(['deep'])
    expect(getErrorMessages('nope')).toEqual([])
    expect(getErrorMessages(null)).toEqual([])
    expect(getErrorMessages({ message: 42, cause: null })).toEqual([])
  })
})
