import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ENV_REGISTRY,
  getEnvVarSpec,
  getMissingRequiredConfig,
  isSetupComplete,
} from '@/lib/env-registry'

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  }
  delete process.env.DATABASE_URL
  delete process.env.BETTER_AUTH_SECRET
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('registry shape', () => {
  it('marks exactly DATABASE_URL and BETTER_AUTH_SECRET as required', () => {
    const required = ENV_REGISTRY.filter((s) => s.required).map((s) => s.key)
    expect(required.sort()).toEqual(['BETTER_AUTH_SECRET', 'DATABASE_URL'])
  })

  it('looks up a spec by key', () => {
    expect(getEnvVarSpec('DATABASE_URL')?.sensitive).toBe(true)
    expect(getEnvVarSpec('NEXT_PUBLIC_APP_URL')?.sensitive).toBe(false)
    expect(getEnvVarSpec('NOT_A_REAL_KEY')).toBeUndefined()
  })
})

describe('getMissingRequiredConfig / isSetupComplete', () => {
  it('reports both required vars missing on a bare environment', () => {
    expect(getMissingRequiredConfig().sort()).toEqual(['BETTER_AUTH_SECRET', 'DATABASE_URL'])
    expect(isSetupComplete()).toBe(false)
  })

  it('reports only the missing one', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/ari'
    expect(getMissingRequiredConfig()).toEqual(['BETTER_AUTH_SECRET'])
    expect(isSetupComplete()).toBe(false)
  })

  it('is complete when both are set', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/ari'
    process.env.BETTER_AUTH_SECRET = 'secret'
    expect(getMissingRequiredConfig()).toEqual([])
    expect(isSetupComplete()).toBe(true)
  })

  it('treats an empty string as missing (parity with the old !! check)', () => {
    process.env.DATABASE_URL = ''
    process.env.BETTER_AUTH_SECRET = 'secret'
    expect(getMissingRequiredConfig()).toEqual(['DATABASE_URL'])
    expect(isSetupComplete()).toBe(false)
  })
})
