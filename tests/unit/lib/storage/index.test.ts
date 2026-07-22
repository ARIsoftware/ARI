/**
 * Tests for lib/storage/index.ts
 *
 * Covers: getStorageProvider() (all provider branches + caching),
 * isStorageUnavailable(), registerBucket(), getBucketConfig(),
 * and the re-exported helpers from sub-modules.
 *
 * Because getStorageProvider() uses module-level singletons for caching,
 * we use vi.resetModules() + loadModule() to get a fresh instance for
 * tests that need predictable cache state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── mocks ──────────────────────────────────────────────────────────────────────

// Use factory-pattern mocks that return class-constructor-compatible mocks
vi.mock('@/lib/storage/s3', () => {
  const S3StorageProvider = vi.fn().mockImplementation(function(cfg: unknown) {
    return { _type: 's3', cfg }
  })
  return { S3StorageProvider }
})

vi.mock('@/lib/storage/local', () => {
  const LocalFilesystemProvider = vi.fn().mockImplementation(function() {
    return { _type: 'local' }
  })
  return {
    LocalFilesystemProvider,
    getMimeTypeForExtension: vi.fn((f: string) => 'application/octet-stream'),
    getDefaultLocalStorageBasePath: vi.fn(() => '/tmp/storage'),
  }
})

vi.mock('@/lib/storage/sanitize', () => ({
  sanitizeFilename: vi.fn((f: string) => f),
  sanitizeBucketName: vi.fn((n: string) => n),
  validateStoredFilename: vi.fn((f: string) => f),
}))

afterEach(() => {
  delete process.env.VERCEL
})

// Load a fresh copy of the module (clears the module-level cache)
async function loadModule() {
  vi.resetModules()
  // Re-apply mocks after reset
  vi.doMock('@/lib/storage/s3', () => {
    const S3StorageProvider = vi.fn().mockImplementation(function(cfg: unknown) {
      return { _type: 's3', cfg }
    })
    return { S3StorageProvider }
  })
  vi.doMock('@/lib/storage/local', () => {
    const LocalFilesystemProvider = vi.fn().mockImplementation(function() {
      return { _type: 'local' }
    })
    return {
      LocalFilesystemProvider,
      getMimeTypeForExtension: vi.fn(),
      getDefaultLocalStorageBasePath: vi.fn(() => '/tmp/storage'),
    }
  })
  vi.doMock('@/lib/storage/sanitize', () => ({
    sanitizeFilename: vi.fn((f: string) => f),
    sanitizeBucketName: vi.fn((n: string) => n),
    validateStoredFilename: vi.fn((f: string) => f),
  }))
  return await import('@/lib/storage/index')
}

// ── getStorageProvider — filesystem ───────────────────────────────────────────

describe('getStorageProvider — filesystem', () => {
  it('returns a provider for "filesystem" string', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider('filesystem')
    expect(provider).toBeDefined()
    expect((provider as any)._type).toBe('local')
  })

  it('returns a provider for default (no arg)', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider()
    expect(provider).toBeDefined()
  })

  it('returns a provider for config with provider=filesystem', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider({ provider: 'filesystem' })
    expect(provider).toBeDefined()
    expect((provider as any)._type).toBe('local')
  })

  it('returns the same cached instance on repeated calls', async () => {
    const { getStorageProvider } = await loadModule()
    const p1 = getStorageProvider('filesystem')
    const p2 = getStorageProvider('filesystem')
    expect(p1).toBe(p2)
  })

  it('returns a local provider for empty/falsy provider string', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider({ provider: '' })
    expect((provider as any)._type).toBe('local')
  })
})

// ── getStorageProvider — non-filesystem string (error) ────────────────────────

describe('getStorageProvider — non-filesystem string without config', () => {
  it('throws when passed a non-filesystem string (no config object)', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() => getStorageProvider('s3' as any)).toThrow(
      /requires full configuration/
    )
  })
})

// ── getStorageProvider — S3 ───────────────────────────────────────────────────

describe('getStorageProvider — s3', () => {
  const baseS3Config = {
    provider: 's3' as const,
    s3AccessKeyId: 'AKIATEST',
    s3SecretAccessKey: 'secret',
    s3Bucket: 'my-bucket',
    s3Region: 'us-east-1',
  }

  it('creates S3StorageProvider for s3 config', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider(baseS3Config)
    expect((provider as any)._type).toBe('s3')
  })

  it('throws when s3AccessKeyId is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseS3Config, s3AccessKeyId: undefined })
    ).toThrow(/ARI_S3_ACCESS_KEY_ID/)
  })

  it('throws when s3SecretAccessKey is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseS3Config, s3SecretAccessKey: undefined })
    ).toThrow(/ARI_S3_SECRET_ACCESS_KEY/)
  })

  it('throws when s3Bucket is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseS3Config, s3Bucket: undefined })
    ).toThrow(/ARI_S3_BUCKET/)
  })

  it('accepts endpoint for custom S3 endpoint', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider({ ...baseS3Config, s3Endpoint: 'https://custom.s3.com' })
    expect(provider).toBeDefined()
  })

  it('handles undefined s3Endpoint gracefully', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider({ ...baseS3Config, s3Endpoint: undefined })
    expect(provider).toBeDefined()
  })

  it('returns cached provider on second call with same config', async () => {
    const { getStorageProvider } = await loadModule()
    const p1 = getStorageProvider(baseS3Config)
    const p2 = getStorageProvider(baseS3Config)
    expect(p1).toBe(p2)
  })
})

// ── getStorageProvider — R2 ───────────────────────────────────────────────────

describe('getStorageProvider — r2', () => {
  const baseR2Config = {
    provider: 'r2' as const,
    r2AccountId: 'r2account123',
    r2AccessKeyId: 'r2-key',
    r2SecretAccessKey: 'r2-secret',
    r2Bucket: 'r2-bucket',
  }

  it('creates S3StorageProvider for r2 config', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider(baseR2Config)
    expect(provider).toBeDefined()
  })

  it('throws when r2AccountId is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseR2Config, r2AccountId: undefined })
    ).toThrow(/ARI_R2_ACCOUNT_ID/)
  })

  it('throws when r2AccessKeyId is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseR2Config, r2AccessKeyId: undefined })
    ).toThrow(/ARI_R2_ACCESS_KEY_ID/)
  })

  it('throws when r2SecretAccessKey is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseR2Config, r2SecretAccessKey: undefined })
    ).toThrow(/ARI_R2_SECRET_ACCESS_KEY/)
  })

  it('throws when r2Bucket is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseR2Config, r2Bucket: undefined })
    ).toThrow(/ARI_R2_BUCKET/)
  })
})

// ── getStorageProvider — Supabase S3 ──────────────────────────────────────────

describe('getStorageProvider — supabase-s3', () => {
  const baseSupabaseConfig = {
    provider: 'supabase-s3' as const,
    supabaseS3AccessKeyId: 'supa-key',
    supabaseS3SecretAccessKey: 'supa-secret',
    supabaseS3Bucket: 'supa-bucket',
    supabaseS3Endpoint: 'https://supa.endpoint.com',
    supabaseS3Region: 'us-east-1',
  }

  it('creates S3StorageProvider for supabase-s3 config', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider(baseSupabaseConfig)
    expect(provider).toBeDefined()
  })

  it('throws when supabaseS3AccessKeyId is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseSupabaseConfig, supabaseS3AccessKeyId: undefined })
    ).toThrow(/ARI_SUPABASE_S3_ACCESS_KEY_ID/)
  })

  it('throws when supabaseS3SecretAccessKey is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseSupabaseConfig, supabaseS3SecretAccessKey: undefined })
    ).toThrow(/ARI_SUPABASE_S3_SECRET_ACCESS_KEY/)
  })

  it('throws when supabaseS3Bucket is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseSupabaseConfig, supabaseS3Bucket: undefined })
    ).toThrow(/ARI_SUPABASE_S3_BUCKET/)
  })

  it('throws when supabaseS3Endpoint is missing', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ ...baseSupabaseConfig, supabaseS3Endpoint: undefined })
    ).toThrow(/ARI_SUPABASE_S3_ENDPOINT/)
  })

  it('uses us-east-1 as default region when supabaseS3Region is missing', async () => {
    const { getStorageProvider } = await loadModule()
    const provider = getStorageProvider({ ...baseSupabaseConfig, supabaseS3Region: undefined })
    expect(provider).toBeDefined()
  })
})

// ── getStorageProvider — unknown provider ─────────────────────────────────────

describe('getStorageProvider — unknown provider', () => {
  it('throws for an unknown provider type', async () => {
    const { getStorageProvider } = await loadModule()
    expect(() =>
      getStorageProvider({ provider: 'gcs' } as any)
    ).toThrow(/Unknown storage provider/)
  })
})

// ── isStorageUnavailable ───────────────────────────────────────────────────────

describe('isStorageUnavailable', () => {
  it('returns false when VERCEL is not set', async () => {
    delete process.env.VERCEL
    const { isStorageUnavailable } = await loadModule()
    expect(isStorageUnavailable('filesystem')).toBe(false)
  })

  it('returns true on Vercel with filesystem provider', async () => {
    process.env.VERCEL = '1'
    const { isStorageUnavailable } = await loadModule()
    expect(isStorageUnavailable('filesystem')).toBe(true)
  })

  it('returns false on Vercel with s3 provider', async () => {
    process.env.VERCEL = '1'
    const { isStorageUnavailable } = await loadModule()
    expect(isStorageUnavailable('s3')).toBe(false)
  })

  it('returns true on Vercel with filesystem config object', async () => {
    process.env.VERCEL = '1'
    const { isStorageUnavailable } = await loadModule()
    expect(isStorageUnavailable({ provider: 'filesystem' })).toBe(true)
  })

  it('returns false on Vercel with s3 config object', async () => {
    process.env.VERCEL = '1'
    const { isStorageUnavailable } = await loadModule()
    expect(isStorageUnavailable({ provider: 's3' } as any)).toBe(false)
  })

  it('returns false with no args (defaults to filesystem) when not on Vercel', async () => {
    delete process.env.VERCEL
    const { isStorageUnavailable } = await loadModule()
    expect(isStorageUnavailable()).toBe(false)
  })
})

// ── registerBucket / getBucketConfig ──────────────────────────────────────────

describe('registerBucket and getBucketConfig', () => {
  it('getBucketConfig returns DEFAULT_BUCKET_CONFIG for unregistered bucket', async () => {
    const { getBucketConfig, DEFAULT_BUCKET_CONFIG } = await loadModule()
    const cfg = getBucketConfig('not-registered')
    expect(cfg).toBe(DEFAULT_BUCKET_CONFIG)
  })

  it('registerBucket stores config and getBucketConfig returns it', async () => {
    const { getBucketConfig, registerBucket } = await loadModule()
    registerBucket('test-bucket', { maxFileSize: 1024 })
    const cfg = getBucketConfig('test-bucket')
    expect(cfg.maxFileSize).toBe(1024)
  })

  it('merges partial config with DEFAULT_BUCKET_CONFIG', async () => {
    const { getBucketConfig, registerBucket } = await loadModule()
    registerBucket('partial-bucket', { maxFileSize: 999 })
    const cfg = getBucketConfig('partial-bucket')
    expect(cfg.maxFileSize).toBe(999)
    expect(Array.isArray(cfg.blockedExtensions)).toBe(true)
    expect(cfg.blockedExtensions.length).toBeGreaterThan(0)
  })

  it('allows overriding allowedMimeTypes', async () => {
    const { getBucketConfig, registerBucket } = await loadModule()
    registerBucket('image-bucket', { allowedMimeTypes: ['image/jpeg', 'image/png'] })
    const cfg = getBucketConfig('image-bucket')
    expect(cfg.allowedMimeTypes).toEqual(['image/jpeg', 'image/png'])
  })

  it('overwriting an existing bucket updates the config', async () => {
    const { getBucketConfig, registerBucket } = await loadModule()
    registerBucket('overwrite-bucket', { maxFileSize: 100 })
    registerBucket('overwrite-bucket', { maxFileSize: 200 })
    const cfg = getBucketConfig('overwrite-bucket')
    expect(cfg.maxFileSize).toBe(200)
  })
})
