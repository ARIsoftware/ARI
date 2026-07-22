/**
 * Tests for documents/lib/providers/index.ts
 *
 * Mocks: @/lib/storage (readStorageConfig), provider constructors.
 * Tests: getActiveProvider, getStorageProvider (caching), getCurrentBucket,
 * isProviderConfigured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock dependencies ───────────────────────────────────────────────────────

vi.mock('@/lib/storage', () => ({
  readStorageConfig: vi.fn(() => ({ provider: 'filesystem' })),
}))

// Mock provider constructors to avoid needing real S3/R2/Supabase env vars
vi.mock('@/modules-core/documents/lib/providers/supabase', () => ({
  SupabaseStorageProvider: vi.fn(function (bucket?: string) {
    return { _type: 'supabase', _bucket: bucket }
  }),
}))

vi.mock('@/modules-core/documents/lib/providers/r2', () => ({
  R2StorageProvider: vi.fn(function (bucket?: string) {
    return { _type: 'r2', _bucket: bucket }
  }),
}))

vi.mock('@/modules-core/documents/lib/providers/s3', () => ({
  S3StorageProvider: vi.fn(function (bucket?: string) {
    return { _type: 's3', _bucket: bucket }
  }),
}))

vi.mock('@/modules-core/documents/lib/providers/local', () => ({
  LocalFilesystemProvider: vi.fn(function (bucket?: string) {
    return { _type: 'local', _bucket: bucket }
  }),
  LOCAL_BUCKET: 'documents',
}))

import { readStorageConfig } from '@/lib/storage'
import {
  getActiveProvider,
  getStorageProvider,
  getCurrentBucket,
  isProviderConfigured,
} from '@/modules-core/documents/lib/providers/index'

const mockReadStorageConfig = vi.mocked(readStorageConfig)

// ─── getActiveProvider ───────────────────────────────────────────────────────

describe('getActiveProvider', () => {
  afterEach(() => vi.clearAllMocks())

  it('maps s3 → s3', () => {
    mockReadStorageConfig.mockReturnValue({ provider: 's3' })
    expect(getActiveProvider()).toBe('s3')
  })

  it('maps r2 → r2', () => {
    mockReadStorageConfig.mockReturnValue({ provider: 'r2' })
    expect(getActiveProvider()).toBe('r2')
  })

  it('maps supabase-s3 → supabase', () => {
    mockReadStorageConfig.mockReturnValue({ provider: 'supabase-s3' })
    expect(getActiveProvider()).toBe('supabase')
  })

  it('maps filesystem → local (default)', () => {
    mockReadStorageConfig.mockReturnValue({ provider: 'filesystem' })
    expect(getActiveProvider()).toBe('local')
  })

  it('maps unknown value → local (default)', () => {
    mockReadStorageConfig.mockReturnValue({ provider: 'unknown-provider' })
    expect(getActiveProvider()).toBe('local')
  })
})

// ─── getStorageProvider ──────────────────────────────────────────────────────

describe('getStorageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear the module-level cache between tests by re-importing
    // (we can't access the map directly, but instanciating is deterministic via mocks)
  })

  it('constructs and returns a supabase provider', () => {
    const p = getStorageProvider('supabase')
    expect((p as unknown as { _type: string })._type).toBe('supabase')
  })

  it('constructs and returns an r2 provider', () => {
    const p = getStorageProvider('r2')
    expect((p as unknown as { _type: string })._type).toBe('r2')
  })

  it('constructs and returns an s3 provider', () => {
    const p = getStorageProvider('s3')
    expect((p as unknown as { _type: string })._type).toBe('s3')
  })

  it('constructs and returns a local provider', () => {
    const p = getStorageProvider('local')
    expect((p as unknown as { _type: string })._type).toBe('local')
  })

  it('returns the same cached instance on repeated calls', () => {
    const p1 = getStorageProvider('s3')
    const p2 = getStorageProvider('s3')
    expect(p1).toBe(p2)
  })

  it('uses bucket override', () => {
    const p = getStorageProvider('r2', 'my-bucket')
    expect((p as unknown as { _bucket: string })._bucket).toBe('my-bucket')
  })

  it('different bucket overrides produce different instances', () => {
    const p1 = getStorageProvider('r2', 'bucket-a')
    const p2 = getStorageProvider('r2', 'bucket-b')
    expect(p1).not.toBe(p2)
  })

  it('null bucketOverride is treated as no override', () => {
    const p1 = getStorageProvider('s3', null)
    const p2 = getStorageProvider('s3', undefined)
    expect(p1).toBe(p2)
  })
})

// ─── getCurrentBucket ────────────────────────────────────────────────────────

describe('getCurrentBucket', () => {
  afterEach(() => {
    delete process.env.ARI_SUPABASE_S3_BUCKET
    delete process.env.ARI_R2_BUCKET
    delete process.env.ARI_S3_BUCKET
  })

  it('returns LOCAL_BUCKET for local provider', () => {
    expect(getCurrentBucket('local')).toBe('documents')
  })

  it('returns ARI_SUPABASE_S3_BUCKET for supabase', () => {
    process.env.ARI_SUPABASE_S3_BUCKET = 'my-supabase-bucket'
    expect(getCurrentBucket('supabase')).toBe('my-supabase-bucket')
  })

  it('returns ARI_R2_BUCKET for r2', () => {
    process.env.ARI_R2_BUCKET = 'my-r2-bucket'
    expect(getCurrentBucket('r2')).toBe('my-r2-bucket')
  })

  it('returns ARI_S3_BUCKET for s3', () => {
    process.env.ARI_S3_BUCKET = 'my-s3-bucket'
    expect(getCurrentBucket('s3')).toBe('my-s3-bucket')
  })

  it('throws when required env var is missing (supabase)', () => {
    delete process.env.ARI_SUPABASE_S3_BUCKET
    expect(() => getCurrentBucket('supabase')).toThrow(/Missing required env var/)
  })

  it('throws when required env var is missing (r2)', () => {
    delete process.env.ARI_R2_BUCKET
    expect(() => getCurrentBucket('r2')).toThrow(/Missing required env var/)
  })

  it('throws when required env var is missing (s3)', () => {
    delete process.env.ARI_S3_BUCKET
    expect(() => getCurrentBucket('s3')).toThrow(/Missing required env var/)
  })
})

// ─── isProviderConfigured ────────────────────────────────────────────────────

describe('isProviderConfigured', () => {
  afterEach(() => {
    delete process.env.ARI_R2_ACCOUNT_ID
    delete process.env.ARI_R2_ACCESS_KEY_ID
    delete process.env.ARI_R2_SECRET_ACCESS_KEY
    delete process.env.ARI_R2_BUCKET
    delete process.env.ARI_S3_ACCESS_KEY_ID
    delete process.env.ARI_S3_SECRET_ACCESS_KEY
    delete process.env.ARI_S3_BUCKET
  })

  it('local provider is always configured (no required env vars)', () => {
    const result = isProviderConfigured('local')
    expect(result.configured).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('r2 configured when all required env vars present', () => {
    process.env.ARI_R2_ACCOUNT_ID = 'acc'
    process.env.ARI_R2_ACCESS_KEY_ID = 'key'
    process.env.ARI_R2_SECRET_ACCESS_KEY = 'secret'
    process.env.ARI_R2_BUCKET = 'bucket'
    const result = isProviderConfigured('r2')
    expect(result.configured).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('r2 not configured when required env vars are missing', () => {
    delete process.env.ARI_R2_ACCOUNT_ID
    const result = isProviderConfigured('r2')
    expect(result.configured).toBe(false)
    expect(result.missing).toContain('ARI_R2_ACCOUNT_ID')
  })

  it('s3 configured when required env vars present', () => {
    process.env.ARI_S3_ACCESS_KEY_ID = 'key'
    process.env.ARI_S3_SECRET_ACCESS_KEY = 'secret'
    process.env.ARI_S3_BUCKET = 'bucket'
    const result = isProviderConfigured('s3')
    expect(result.configured).toBe(true)
  })

  it('s3 not configured when vars missing', () => {
    delete process.env.ARI_S3_ACCESS_KEY_ID
    delete process.env.ARI_S3_SECRET_ACCESS_KEY
    delete process.env.ARI_S3_BUCKET
    const result = isProviderConfigured('s3')
    expect(result.configured).toBe(false)
    expect(result.missing.length).toBeGreaterThan(0)
  })
})
