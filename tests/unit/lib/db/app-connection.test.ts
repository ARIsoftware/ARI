/**
 * Tests for lib/db/app-connection.ts — pure derivation of the app role's
 * connection config from the privileged DATABASE_URL.
 */
import { describe, it, expect, vi } from 'vitest'

// app-connection reuses sslConfigFor from pool.ts; mock the module so no Pool is created.
vi.mock('@/lib/db/pool', () => ({
  sslConfigFor: (url: string) =>
    url.includes('127.0.0.1') || url.includes('localhost') ? false : { rejectUnauthorized: false },
}))

import {
  APP_ROLE_NAME,
  buildAppPoolConfig,
  deriveAppLoginName,
  isSupavisorPooler,
} from '@/lib/db/app-connection'

describe('APP_ROLE_NAME', () => {
  it('is the constant every grant and health check keys on', () => {
    expect(APP_ROLE_NAME).toBe('ari_app')
  })
})

describe('isSupavisorPooler', () => {
  it('recognises the pooler host on any port', () => {
    expect(isSupavisorPooler('aws-0-us-east-1.pooler.supabase.com', 5432)).toBe(true)
    expect(isSupavisorPooler('aws-0-us-east-1.pooler.supabase.com', undefined)).toBe(true)
  })

  it('recognises the transaction-mode port on any host', () => {
    expect(isSupavisorPooler('db.example.com', 6543)).toBe(true)
  })

  it('is false for direct connections', () => {
    expect(isSupavisorPooler('db.abcdefghijkl.supabase.co', 5432)).toBe(false)
    expect(isSupavisorPooler('127.0.0.1', 54322)).toBe(false)
    expect(isSupavisorPooler(null, undefined)).toBe(false)
    expect(isSupavisorPooler(undefined, 5432)).toBe(false)
  })
})

describe('deriveAppLoginName', () => {
  it('suffixes the tenant ref on Supavisor when the privileged login is tenant-encoded', () => {
    expect(
      deriveAppLoginName('postgres.abcdefghijkl', 'aws-0-eu-west-1.pooler.supabase.com', 6543),
    ).toBe('ari_app.abcdefghijkl')
    expect(
      deriveAppLoginName('postgres.abcdefghijkl', 'aws-0-eu-west-1.pooler.supabase.com', 5432),
    ).toBe('ari_app.abcdefghijkl')
    expect(deriveAppLoginName('postgres.abcdefghijkl', 'some-proxy.internal', 6543)).toBe(
      'ari_app.abcdefghijkl',
    )
  })

  it('keeps the plain role name for direct connections even with a dotted login', () => {
    expect(deriveAppLoginName('postgres.abcdefghijkl', 'db.abcdefghijkl.supabase.co', 5432)).toBe(
      'ari_app',
    )
    expect(deriveAppLoginName('first.last', 'db.example.com', 5432)).toBe('ari_app')
  })

  it('keeps the plain role name on Supavisor when the privileged login is not tenant-encoded', () => {
    expect(deriveAppLoginName('postgres', 'aws-0-us-east-1.pooler.supabase.com', 6543)).toBe(
      'ari_app',
    )
    expect(deriveAppLoginName('', 'aws-0-us-east-1.pooler.supabase.com', 6543)).toBe('ari_app')
    expect(deriveAppLoginName(null, 'aws-0-us-east-1.pooler.supabase.com', 6543)).toBe('ari_app')
    expect(deriveAppLoginName(undefined, undefined, 6543)).toBe('ari_app')
  })

  it('does not treat multi-dot or non-alphanumeric refs as a tenant encoding', () => {
    expect(deriveAppLoginName('a.b.c', 'x.pooler.supabase.com', 6543)).toBe('ari_app')
    expect(deriveAppLoginName('postgres.ref-1', 'x.pooler.supabase.com', 6543)).toBe('ari_app')
  })
})

describe('buildAppPoolConfig', () => {
  it('derives a local plain-Postgres config (no TLS, plain role name)', () => {
    const cfg = buildAppPoolConfig('postgresql://postgres:secret@localhost:5432/ari', 'app-pw')
    expect(cfg).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'ari',
      user: 'ari_app',
      password: 'app-pw',
      ssl: false,
    })
  })

  it('derives the local Supabase stack config', () => {
    const cfg = buildAppPoolConfig('postgresql://postgres:postgres@127.0.0.1:54322/postgres', 'pw')
    expect(cfg.host).toBe('127.0.0.1')
    expect(cfg.port).toBe(54322)
    expect(cfg.database).toBe('postgres')
    expect(cfg.user).toBe('ari_app')
    expect(cfg.ssl).toBe(false)
  })

  it('derives a Supavisor transaction-mode config with the tenant-suffixed login', () => {
    const cfg = buildAppPoolConfig(
      'postgresql://postgres.abcdefghijkl:p%40ss%3Aw0rd@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
      'pw',
    )
    expect(cfg).toEqual({
      host: 'aws-0-us-east-1.pooler.supabase.com',
      port: 6543,
      database: 'postgres',
      user: 'ari_app.abcdefghijkl',
      password: 'pw',
      ssl: { rejectUnauthorized: false },
    })
  })

  it('derives a Supavisor session-mode (5432 on the pooler host) config with the suffix', () => {
    const cfg = buildAppPoolConfig(
      'postgresql://postgres.abcdefghijkl:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      'x',
    )
    expect(cfg.user).toBe('ari_app.abcdefghijkl')
    expect(cfg.port).toBe(5432)
  })

  it('derives a direct Supabase Cloud config without the suffix', () => {
    const cfg = buildAppPoolConfig(
      'postgresql://postgres:pw@db.abcdefghijkl.supabase.co:5432/postgres',
      'x',
    )
    expect(cfg.user).toBe('ari_app')
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false })
  })

  it('never carries the privileged password, however exotic', () => {
    const cfg = buildAppPoolConfig(
      'postgresql://postgres:p%40%24%25%5E%26*()%3D@db.example.com/ari',
      'app-pw',
    )
    expect(cfg.password).toBe('app-pw')
    expect(JSON.stringify(cfg)).not.toContain('p@$%^&*()=')
  })

  it('leaves port and database undefined when the URL omits them (pg applies its defaults)', () => {
    const cfg = buildAppPoolConfig('postgresql://postgres@db.example.com', 'pw')
    expect(cfg.port).toBeUndefined()
    expect(cfg.database).toBeUndefined()
    expect(cfg.host).toBe('db.example.com')
  })

  it('throws on a URL pg itself could not parse', () => {
    expect(() => buildAppPoolConfig('postgres://user:pa#ss@host.example.com/db', 'pw')).toThrow()
  })
})
