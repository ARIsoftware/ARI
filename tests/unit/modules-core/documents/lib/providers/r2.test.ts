/**
 * Tests for documents/lib/providers/r2.ts (R2StorageProvider).
 *
 * Mocks @aws-sdk/client-s3 to avoid real S3Client construction.
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

import { R2StorageProvider } from '@/modules-core/documents/lib/providers/r2'

const REQUIRED_ENV: Record<string, string> = {
  ARI_R2_ACCOUNT_ID: 'test-account-id',
  ARI_R2_ACCESS_KEY_ID: 'test-access-key',
  ARI_R2_SECRET_ACCESS_KEY: 'test-secret-key',
  ARI_R2_BUCKET: 'test-bucket',
}

function setEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  Object.assign(process.env, REQUIRED_ENV, overrides)
}

function clearEnv() {
  for (const key of Object.keys(REQUIRED_ENV)) {
    delete process.env[key]
  }
}

describe('R2StorageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv()
  })

  afterEach(() => clearEnv())

  it('constructs successfully with all env vars set', () => {
    expect(() => new R2StorageProvider()).not.toThrow()
  })

  it('throws when ARI_R2_ACCOUNT_ID is missing', () => {
    delete process.env.ARI_R2_ACCOUNT_ID
    expect(() => new R2StorageProvider()).toThrow(/Missing Cloudflare R2 environment variables/)
    expect(() => new R2StorageProvider()).toThrow(/ARI_R2_ACCOUNT_ID/)
  })

  it('throws when ARI_R2_ACCESS_KEY_ID is missing', () => {
    delete process.env.ARI_R2_ACCESS_KEY_ID
    expect(() => new R2StorageProvider()).toThrow(/ARI_R2_ACCESS_KEY_ID/)
  })

  it('throws when ARI_R2_SECRET_ACCESS_KEY is missing', () => {
    delete process.env.ARI_R2_SECRET_ACCESS_KEY
    expect(() => new R2StorageProvider()).toThrow(/ARI_R2_SECRET_ACCESS_KEY/)
  })

  it('throws when ARI_R2_BUCKET is missing (no override)', () => {
    delete process.env.ARI_R2_BUCKET
    expect(() => new R2StorageProvider()).toThrow(/ARI_R2_BUCKET/)
  })

  it('does NOT require ARI_R2_BUCKET when bucketOverride is supplied', () => {
    delete process.env.ARI_R2_BUCKET
    expect(() => new R2StorageProvider('override-bucket')).not.toThrow()
  })

  it('passes override bucket to S3CompatibleProvider', () => {
    new R2StorageProvider('my-override')
    expect(mockS3CompatibleCtor).toHaveBeenCalledWith(
      expect.anything(),
      'my-override',
      'r2',
    )
  })

  it('passes ARI_R2_BUCKET to S3CompatibleProvider when no override', () => {
    new R2StorageProvider()
    expect(mockS3CompatibleCtor).toHaveBeenCalledWith(
      expect.anything(),
      'test-bucket',
      'r2',
    )
  })

  it('uses region "auto" in S3Client config', () => {
    new R2StorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.region).toBe('auto')
  })

  it('sets endpoint from ARI_R2_ACCOUNT_ID', () => {
    new R2StorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.endpoint).toContain('test-account-id')
    expect(config.endpoint).toContain('r2.cloudflarestorage.com')
  })
})
