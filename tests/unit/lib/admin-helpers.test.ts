import { describe, it, expect, afterEach } from 'vitest'
import { isProductionSafeOperation } from '@/lib/admin-helpers'

const orig = process.env.ALLOW_BACKUP_OPERATIONS

afterEach(() => {
  if (orig === undefined) {
    delete process.env.ALLOW_BACKUP_OPERATIONS
  } else {
    process.env.ALLOW_BACKUP_OPERATIONS = orig
  }
})

describe('isProductionSafeOperation', () => {
  it('returns true when env var is not set', () => {
    delete process.env.ALLOW_BACKUP_OPERATIONS
    expect(isProductionSafeOperation()).toBe(true)
  })

  it('returns true when env var is "true"', () => {
    process.env.ALLOW_BACKUP_OPERATIONS = 'true'
    expect(isProductionSafeOperation()).toBe(true)
  })

  it('returns false when env var is "false"', () => {
    process.env.ALLOW_BACKUP_OPERATIONS = 'false'
    expect(isProductionSafeOperation()).toBe(false)
  })

  it('returns true when env var is any other string (only "false" disables it)', () => {
    process.env.ALLOW_BACKUP_OPERATIONS = 'no'
    expect(isProductionSafeOperation()).toBe(true)
  })
})
