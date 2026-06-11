import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDbMode, isSupabaseMode } from '@/lib/db/mode'

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {
    ARI_DB_MODE: process.env.ARI_DB_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }
  delete process.env.ARI_DB_MODE
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('getDbMode — explicit ARI_DB_MODE', () => {
  it('returns postgres when ARI_DB_MODE=postgres', () => {
    process.env.ARI_DB_MODE = 'postgres'
    expect(getDbMode()).toBe('postgres')
  })

  it('returns supabaselocal when ARI_DB_MODE=supabaselocal', () => {
    process.env.ARI_DB_MODE = 'supabaselocal'
    expect(getDbMode()).toBe('supabaselocal')
  })

  it('returns supabasecloud when ARI_DB_MODE=supabasecloud', () => {
    process.env.ARI_DB_MODE = 'supabasecloud'
    expect(getDbMode()).toBe('supabasecloud')
  })

  it('explicit ARI_DB_MODE wins over NEXT_PUBLIC_SUPABASE_URL', () => {
    process.env.ARI_DB_MODE = 'postgres'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    expect(getDbMode()).toBe('postgres')
  })

  it('falls through to inference on invalid ARI_DB_MODE value', () => {
    process.env.ARI_DB_MODE = 'invalid-mode'
    // No SUPABASE_URL → should fall back to postgres
    expect(getDbMode()).toBe('postgres')
  })
})

describe('getDbMode — inference from NEXT_PUBLIC_SUPABASE_URL', () => {
  it('returns postgres when no env vars set', () => {
    expect(getDbMode()).toBe('postgres')
  })

  it('returns supabaselocal for 127.0.0.1 URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    expect(getDbMode()).toBe('supabaselocal')
  })

  it('returns supabaselocal for localhost URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    expect(getDbMode()).toBe('supabaselocal')
  })

  it('returns supabasecloud for a remote Supabase URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    expect(getDbMode()).toBe('supabasecloud')
  })
})

describe('isSupabaseMode', () => {
  it('returns false for postgres mode', () => {
    expect(isSupabaseMode()).toBe(false)
  })

  it('returns true for supabaselocal', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    expect(isSupabaseMode()).toBe(true)
  })

  it('returns true for supabasecloud', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    expect(isSupabaseMode()).toBe(true)
  })
})
