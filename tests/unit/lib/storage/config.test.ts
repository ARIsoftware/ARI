/**
 * Tests for lib/storage/config.ts
 *
 * Covers: readStorageConfig(), PROVIDER_LABELS, ENV_MAP constants.
 * All logic is pure env-var reads — no mocking of modules needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readStorageConfig, PROVIDER_LABELS, ENV_MAP } from '@/lib/storage/config'

// Snapshot the original env so we can restore after each test
let originalEnv: NodeJS.ProcessEnv

beforeEach(() => {
  originalEnv = { ...process.env }
  // Clear all storage-related env vars to start from a known state
  for (const key of Object.values(ENV_MAP)) {
    delete process.env[key]
  }
})

afterEach(() => {
  // Restore original env vars
  for (const key of Object.values(ENV_MAP)) {
    delete process.env[key]
  }
  // Restore any keys that were originally set
  for (const [k, v] of Object.entries(originalEnv)) {
    if (Object.values(ENV_MAP).includes(k)) {
      process.env[k] = v
    }
  }
})

describe('PROVIDER_LABELS', () => {
  it('has human-readable label for filesystem', () => {
    expect(PROVIDER_LABELS.filesystem).toBe('Local Filesystem')
  })

  it('has human-readable label for s3', () => {
    expect(PROVIDER_LABELS.s3).toBe('AWS S3')
  })

  it('has human-readable label for r2', () => {
    expect(PROVIDER_LABELS.r2).toBe('Cloudflare R2')
  })

  it('has human-readable label for supabase-s3', () => {
    expect(PROVIDER_LABELS['supabase-s3']).toBe('Supabase Storage (S3)')
  })
})

describe('ENV_MAP', () => {
  it('maps provider to ARI_STORAGE_PROVIDER', () => {
    expect(ENV_MAP.provider).toBe('ARI_STORAGE_PROVIDER')
  })

  it('maps s3AccessKeyId to ARI_S3_ACCESS_KEY_ID', () => {
    expect(ENV_MAP.s3AccessKeyId).toBe('ARI_S3_ACCESS_KEY_ID')
  })

  it('maps r2AccountId to ARI_R2_ACCOUNT_ID', () => {
    expect(ENV_MAP.r2AccountId).toBe('ARI_R2_ACCOUNT_ID')
  })

  it('maps supabaseS3Endpoint to ARI_SUPABASE_S3_ENDPOINT', () => {
    expect(ENV_MAP.supabaseS3Endpoint).toBe('ARI_SUPABASE_S3_ENDPOINT')
  })
})

describe('readStorageConfig — defaults', () => {
  it('defaults to filesystem provider when no env vars set', () => {
    const config = readStorageConfig()
    expect(config.provider).toBe('filesystem')
  })

  it('returns object with no extra keys when no env vars set', () => {
    const config = readStorageConfig()
    // Only 'provider' should be set
    const keys = Object.keys(config).filter(k => config[k as keyof typeof config] !== undefined)
    expect(keys).toEqual(['provider'])
  })
})

describe('readStorageConfig — reads env vars', () => {
  it('picks up ARI_STORAGE_PROVIDER', () => {
    process.env.ARI_STORAGE_PROVIDER = 's3'
    const config = readStorageConfig()
    expect(config.provider).toBe('s3')
  })

  it('picks up ARI_S3_ACCESS_KEY_ID', () => {
    process.env.ARI_S3_ACCESS_KEY_ID = 'AKIATEST123'
    const config = readStorageConfig()
    expect(config.s3AccessKeyId).toBe('AKIATEST123')
  })

  it('picks up ARI_S3_SECRET_ACCESS_KEY', () => {
    process.env.ARI_S3_SECRET_ACCESS_KEY = 'mysecret'
    const config = readStorageConfig()
    expect(config.s3SecretAccessKey).toBe('mysecret')
  })

  it('picks up ARI_S3_BUCKET', () => {
    process.env.ARI_S3_BUCKET = 'my-bucket'
    const config = readStorageConfig()
    expect(config.s3Bucket).toBe('my-bucket')
  })

  it('picks up ARI_S3_REGION', () => {
    process.env.ARI_S3_REGION = 'eu-west-1'
    const config = readStorageConfig()
    expect(config.s3Region).toBe('eu-west-1')
  })

  it('picks up ARI_S3_ENDPOINT', () => {
    process.env.ARI_S3_ENDPOINT = 'https://s3.custom.com'
    const config = readStorageConfig()
    expect(config.s3Endpoint).toBe('https://s3.custom.com')
  })

  it('picks up ARI_R2_ACCOUNT_ID', () => {
    process.env.ARI_R2_ACCOUNT_ID = 'r2-account-xyz'
    const config = readStorageConfig()
    expect(config.r2AccountId).toBe('r2-account-xyz')
  })

  it('picks up ARI_R2_ACCESS_KEY_ID', () => {
    process.env.ARI_R2_ACCESS_KEY_ID = 'r2-key'
    const config = readStorageConfig()
    expect(config.r2AccessKeyId).toBe('r2-key')
  })

  it('picks up ARI_R2_SECRET_ACCESS_KEY', () => {
    process.env.ARI_R2_SECRET_ACCESS_KEY = 'r2-secret'
    const config = readStorageConfig()
    expect(config.r2SecretAccessKey).toBe('r2-secret')
  })

  it('picks up ARI_R2_BUCKET', () => {
    process.env.ARI_R2_BUCKET = 'my-r2-bucket'
    const config = readStorageConfig()
    expect(config.r2Bucket).toBe('my-r2-bucket')
  })

  it('picks up ARI_SUPABASE_S3_ACCESS_KEY_ID', () => {
    process.env.ARI_SUPABASE_S3_ACCESS_KEY_ID = 'supa-key'
    const config = readStorageConfig()
    expect(config.supabaseS3AccessKeyId).toBe('supa-key')
  })

  it('picks up ARI_SUPABASE_S3_SECRET_ACCESS_KEY', () => {
    process.env.ARI_SUPABASE_S3_SECRET_ACCESS_KEY = 'supa-secret'
    const config = readStorageConfig()
    expect(config.supabaseS3SecretAccessKey).toBe('supa-secret')
  })

  it('picks up ARI_SUPABASE_S3_BUCKET', () => {
    process.env.ARI_SUPABASE_S3_BUCKET = 'supa-bucket'
    const config = readStorageConfig()
    expect(config.supabaseS3Bucket).toBe('supa-bucket')
  })

  it('picks up ARI_SUPABASE_S3_ENDPOINT', () => {
    process.env.ARI_SUPABASE_S3_ENDPOINT = 'https://supa.endpoint.com'
    const config = readStorageConfig()
    expect(config.supabaseS3Endpoint).toBe('https://supa.endpoint.com')
  })

  it('picks up ARI_SUPABASE_S3_REGION', () => {
    process.env.ARI_SUPABASE_S3_REGION = 'us-east-2'
    const config = readStorageConfig()
    expect(config.supabaseS3Region).toBe('us-east-2')
  })

  it('assembles a full S3 config from multiple env vars', () => {
    process.env.ARI_STORAGE_PROVIDER = 's3'
    process.env.ARI_S3_ACCESS_KEY_ID = 'key'
    process.env.ARI_S3_SECRET_ACCESS_KEY = 'secret'
    process.env.ARI_S3_BUCKET = 'bucket'
    process.env.ARI_S3_REGION = 'us-east-1'
    const config = readStorageConfig()
    expect(config.provider).toBe('s3')
    expect(config.s3AccessKeyId).toBe('key')
    expect(config.s3SecretAccessKey).toBe('secret')
    expect(config.s3Bucket).toBe('bucket')
    expect(config.s3Region).toBe('us-east-1')
  })

  it('does not include fields for empty string env vars', () => {
    process.env.ARI_S3_ENDPOINT = ''
    const config = readStorageConfig()
    // Empty string is falsy, so the field should not be set
    expect(config.s3Endpoint).toBeUndefined()
  })
})
