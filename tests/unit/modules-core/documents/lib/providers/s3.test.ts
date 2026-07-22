/**
 * Tests for documents/lib/providers/s3.ts (S3StorageProvider).
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

import { S3StorageProvider } from '@/modules-core/documents/lib/providers/s3'

const REQUIRED_ENV: Record<string, string> = {
  ARI_S3_ACCESS_KEY_ID: 'test-access-key',
  ARI_S3_SECRET_ACCESS_KEY: 'test-secret-key',
  ARI_S3_BUCKET: 'test-s3-bucket',
}

function setEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  Object.assign(process.env, REQUIRED_ENV, overrides)
}

function clearEnv() {
  for (const key of [...Object.keys(REQUIRED_ENV), 'ARI_S3_REGION', 'ARI_S3_ENDPOINT']) {
    delete process.env[key]
  }
}

describe('S3StorageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv()
  })

  afterEach(() => clearEnv())

  it('constructs successfully with all required env vars set', () => {
    expect(() => new S3StorageProvider()).not.toThrow()
  })

  it('throws when ARI_S3_ACCESS_KEY_ID is missing', () => {
    delete process.env.ARI_S3_ACCESS_KEY_ID
    expect(() => new S3StorageProvider()).toThrow(/Missing AWS S3 environment variables/)
    expect(() => new S3StorageProvider()).toThrow(/ARI_S3_ACCESS_KEY_ID/)
  })

  it('throws when ARI_S3_SECRET_ACCESS_KEY is missing', () => {
    delete process.env.ARI_S3_SECRET_ACCESS_KEY
    expect(() => new S3StorageProvider()).toThrow(/ARI_S3_SECRET_ACCESS_KEY/)
  })

  it('throws when ARI_S3_BUCKET is missing (no override)', () => {
    delete process.env.ARI_S3_BUCKET
    expect(() => new S3StorageProvider()).toThrow(/ARI_S3_BUCKET/)
  })

  it('does NOT require ARI_S3_BUCKET when bucketOverride is supplied', () => {
    delete process.env.ARI_S3_BUCKET
    expect(() => new S3StorageProvider('override-bucket')).not.toThrow()
  })

  it('passes override bucket to S3CompatibleProvider', () => {
    new S3StorageProvider('my-override')
    expect(mockS3CompatibleCtor).toHaveBeenCalledWith(
      expect.anything(),
      'my-override',
      's3',
    )
  })

  it('passes ARI_S3_BUCKET to S3CompatibleProvider when no override', () => {
    new S3StorageProvider()
    expect(mockS3CompatibleCtor).toHaveBeenCalledWith(
      expect.anything(),
      'test-s3-bucket',
      's3',
    )
  })

  it('defaults region to us-east-1 when ARI_S3_REGION is unset', () => {
    delete process.env.ARI_S3_REGION
    new S3StorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.region).toBe('us-east-1')
  })

  it('uses ARI_S3_REGION when set', () => {
    process.env.ARI_S3_REGION = 'eu-west-1'
    new S3StorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.region).toBe('eu-west-1')
  })

  it('endpoint is undefined when ARI_S3_ENDPOINT is unset', () => {
    delete process.env.ARI_S3_ENDPOINT
    new S3StorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.endpoint).toBeUndefined()
  })

  it('uses ARI_S3_ENDPOINT when set', () => {
    process.env.ARI_S3_ENDPOINT = 'https://custom.s3.example.com'
    new S3StorageProvider()
    const [config] = mockS3Client.mock.calls[0] as unknown as [Record<string, any>]
    expect(config.endpoint).toBe('https://custom.s3.example.com')
  })
})
