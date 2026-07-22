/**
 * Tests for documents/lib/providers/supabase.ts (SupabaseStorageProvider).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockS3Client, mockS3CompatibleCtor } = vi.hoisted(() => ({
  mockS3Client: vi.fn(function () { return { send: vi.fn() } }),
  mockS3CompatibleCtor: vi.fn(function (
    this: { client: unknown; bucket: string; label: string },
    client: unknown,
    bucket: string,
    label: string,
  ) {
    this.client = client
    this.bucket = bucket
    this.label = label
  }),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3Client,
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}))

vi.mock('@/modules-core/documents/lib/providers/s3-compatible', () => ({
  S3CompatibleProvider: mockS3CompatibleCtor,
}))

import { SupabaseStorageProvider } from '@/modules-core/documents/lib/providers/supabase'

const REQUIRED_ENV: Record<string, string> = {
  ARI_SUPABASE_S3_ENDPOINT: 'https://proj.supabase.co/storage/v1/s3',
  ARI_SUPABASE_S3_ACCESS_KEY_ID: 'test-access-key',
  ARI_SUPABASE_S3_SECRET_ACCESS_KEY: 'test-secret-key',
  ARI_SUPABASE_S3_BUCKET: 'test-supabase-bucket',
}

function setEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  Object.assign(process.env, REQUIRED_ENV, overrides)
}

function clearEnv() {
  for (const key of [...Object.keys(REQUIRED_ENV), 'ARI_SUPABASE_S3_REGION']) {
    delete process.env[key]
  }
}

describe('SupabaseStorageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv()
  })

  afterEach(() => clearEnv())

  it('constructs successfully with all required env vars set', () => {
    expect(() => new SupabaseStorageProvider()).not.toThrow()
  })

  it('throws when ARI_SUPABASE_S3_ENDPOINT is missing', () => {
    delete process.env.ARI_SUPABASE_S3_ENDPOINT
    expect(() => new SupabaseStorageProvider()).toThrow(/Missing Supabase S3 environment variables/)
    expect(() => new SupabaseStorageProvider()).toThrow(/ARI_SUPABASE_S3_ENDPOINT/)
  })

  it('throws when ARI_SUPABASE_S3_ACCESS_KEY_ID is missing', () => {
    delete process.env.ARI_SUPABASE_S3_ACCESS_KEY_ID
    expect(() => new SupabaseStorageProvider()).toThrow(/ARI_SUPABASE_S3_ACCESS_KEY_ID/)
  })

  it('throws when ARI_SUPABASE_S3_SECRET_ACCESS_KEY is missing', () => {
    delete process.env.ARI_SUPABASE_S3_SECRET_ACCESS_KEY
    expect(() => new SupabaseStorageProvider()).toThrow(/ARI_SUPABASE_S3_SECRET_ACCESS_KEY/)
  })

  it('throws when ARI_SUPABASE_S3_BUCKET is missing (no override)', () => {
    delete process.env.ARI_SUPABASE_S3_BUCKET
    expect(() => new SupabaseStorageProvider()).toThrow(/ARI_SUPABASE_S3_BUCKET/)
  })

  it('does NOT require ARI_SUPABASE_S3_BUCKET when bucketOverride is supplied', () => {
    delete process.env.ARI_SUPABASE_S3_BUCKET
    expect(() => new SupabaseStorageProvider('override-bucket')).not.toThrow()
  })

  it('passes override bucket to S3CompatibleProvider', () => {
    new SupabaseStorageProvider('my-override')
    expect(mockS3CompatibleCtor).toHaveBeenCalledWith(
      expect.anything(),
      'my-override',
      'supabase',
    )
  })

  it('passes ARI_SUPABASE_S3_BUCKET to S3CompatibleProvider when no override', () => {
    new SupabaseStorageProvider()
    expect(mockS3CompatibleCtor).toHaveBeenCalledWith(
      expect.anything(),
      'test-supabase-bucket',
      'supabase',
    )
  })

  it('defaults region to us-east-1 when ARI_SUPABASE_S3_REGION is unset', () => {
    delete process.env.ARI_SUPABASE_S3_REGION
    new SupabaseStorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.region).toBe('us-east-1')
  })

  it('uses ARI_SUPABASE_S3_REGION when set', () => {
    process.env.ARI_SUPABASE_S3_REGION = 'ap-southeast-1'
    new SupabaseStorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.region).toBe('ap-southeast-1')
  })

  it('sets forcePathStyle to true (Supabase requires path-style URLs)', () => {
    new SupabaseStorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.forcePathStyle).toBe(true)
  })

  it('sets endpoint from ARI_SUPABASE_S3_ENDPOINT', () => {
    new SupabaseStorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.endpoint).toBe('https://proj.supabase.co/storage/v1/s3')
  })
})
