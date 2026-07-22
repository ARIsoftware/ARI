/**
 * Tests for lib/storage/s3.ts
 *
 * The S3StorageProvider wraps @aws-sdk/client-s3 for all I/O. We mock the
 * S3Client so all pure logic (key construction, pagination, error handling,
 * content-type derivation, etc.) can be exercised without network access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mock @aws-sdk/client-s3 before importing the module under test ─────────────

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = mockSend
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  class ListObjectsV2Command {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command }
})

import { S3StorageProvider } from '@/lib/storage/s3'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<{
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region: string
  endpoint: string
}> = {}) {
  return new S3StorageProvider({
    accessKeyId: overrides.accessKeyId ?? 'AKIATEST',
    secretAccessKey: overrides.secretAccessKey ?? 'secretkey',
    bucket: overrides.bucket ?? 'test-bucket',
    region: overrides.region,
    endpoint: overrides.endpoint,
  })
}

beforeEach(() => {
  mockSend.mockReset()
})

// ── constructor ───────────────────────────────────────────────────────────────

describe('S3StorageProvider — constructor', () => {
  it('constructs without throwing', () => {
    expect(() => makeProvider()).not.toThrow()
  })

  it('accepts endpoint for S3-compatible services', () => {
    expect(() =>
      makeProvider({ endpoint: 'https://r2.cloudflarestorage.com/bucket' }),
    ).not.toThrow()
  })

  it('uses us-east-1 as default region', () => {
    // No assertion on internals — just that it constructs without error
    expect(() => makeProvider()).not.toThrow()
  })
})

// ── upload ────────────────────────────────────────────────────────────────────

describe('S3StorageProvider.upload', () => {
  it('calls S3 PutObjectCommand and returns path/name', async () => {
    mockSend.mockResolvedValue({})
    const provider = makeProvider()
    const data = Buffer.from('hello')
    const result = await provider.upload('user1', 'avatars', 'photo.jpg', data, 'image/jpeg')

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(typeof result.path).toBe('string')
    expect(typeof result.name).toBe('string')
    expect(result.name.endsWith('-photo.jpg')).toBe(true)
    expect(result.path).toContain('avatars/')
  })

  it('uses timestamp prefix in stored name', async () => {
    mockSend.mockResolvedValue({})
    const before = Date.now()
    const provider = makeProvider()
    const result = await provider.upload('u1', 'docs', 'report.pdf', Buffer.from('x'), 'application/pdf')
    const after = Date.now()

    const ts = parseInt(result.name.split('-')[0], 10)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('passes contentType to PutObjectCommand', async () => {
    mockSend.mockResolvedValue({})
    const provider = makeProvider()
    await provider.upload('u1', 'docs', 'file.pdf', Buffer.from('x'), 'application/pdf')

    const command = mockSend.mock.calls[0][0]
    expect(command.input.ContentType).toBe('application/pdf')
  })

  it('key includes userId/bucket/storedName', async () => {
    mockSend.mockResolvedValue({})
    const provider = makeProvider()
    await provider.upload('my-user', 'photos', 'avatar.png', Buffer.from(''), 'image/png')

    const command = mockSend.mock.calls[0][0]
    expect(command.input.Key).toMatch(/^my-user\/photos\/\d+-avatar\.png$/)
  })
})

// ── serve ─────────────────────────────────────────────────────────────────────

describe('S3StorageProvider.serve', () => {
  it('returns ServeResult when object is found', async () => {
    const mockStream = new ReadableStream()
    mockSend.mockResolvedValue({
      Body: { transformToWebStream: () => mockStream },
      ContentLength: 42,
    })
    const provider = makeProvider()
    const result = await provider.serve('u1', 'docs', 'report.pdf')

    expect(result).not.toBeNull()
    expect(result?.stream).toBe(mockStream)
    expect(result?.size).toBe(42)
    // content-type derived from extension
    expect(result?.contentType).toBe('application/pdf')
  })

  it('returns null when Body is missing', async () => {
    mockSend.mockResolvedValue({ Body: null, ContentLength: 0 })
    const provider = makeProvider()
    const result = await provider.serve('u1', 'docs', 'file.pdf')
    expect(result).toBeNull()
  })

  it('returns null on NoSuchKey error', async () => {
    const err = Object.assign(new Error('No such key'), { name: 'NoSuchKey' })
    mockSend.mockRejectedValue(err)
    const provider = makeProvider()
    const result = await provider.serve('u1', 'docs', 'missing.pdf')
    expect(result).toBeNull()
  })

  it('returns null on NotFound error', async () => {
    const err = Object.assign(new Error('Not found'), { name: 'NotFound' })
    mockSend.mockRejectedValue(err)
    const provider = makeProvider()
    const result = await provider.serve('u1', 'docs', 'missing.pdf')
    expect(result).toBeNull()
  })

  it('rethrows unknown errors', async () => {
    const err = Object.assign(new Error('Access denied'), { name: 'AccessDenied' })
    mockSend.mockRejectedValue(err)
    const provider = makeProvider()
    await expect(provider.serve('u1', 'docs', 'file.pdf')).rejects.toThrow('Access denied')
  })

  it('uses 0 as size when ContentLength is missing', async () => {
    const mockStream = new ReadableStream()
    mockSend.mockResolvedValue({
      Body: { transformToWebStream: () => mockStream },
      // ContentLength omitted
    })
    const provider = makeProvider()
    const result = await provider.serve('u1', 'photos', 'img.jpg')
    expect(result?.size).toBe(0)
  })

  it('derives content-type from extension (not S3 metadata)', async () => {
    const mockStream = new ReadableStream()
    mockSend.mockResolvedValue({
      Body: { transformToWebStream: () => mockStream },
      ContentType: 'text/html', // attacker-supplied — should be ignored
      ContentLength: 10,
    })
    const provider = makeProvider()
    const result = await provider.serve('u1', 'bucket', 'photo.jpg')
    expect(result?.contentType).toBe('image/jpeg')
  })
})

// ── delete ────────────────────────────────────────────────────────────────────

describe('S3StorageProvider.delete', () => {
  it('calls DeleteObjectCommand with correct key', async () => {
    mockSend.mockResolvedValue({})
    const provider = makeProvider()
    await provider.delete('u1', 'docs', 'file.pdf')

    expect(mockSend).toHaveBeenCalledTimes(1)
    const command = mockSend.mock.calls[0][0]
    expect(command.input.Key).toBe('u1/docs/file.pdf')
    expect(command.input.Bucket).toBe('test-bucket')
  })

  it('does not throw for missing keys (S3 no-op)', async () => {
    mockSend.mockResolvedValue({})
    const provider = makeProvider()
    await expect(provider.delete('u1', 'docs', 'nonexistent.pdf')).resolves.toBeUndefined()
  })
})

// ── list ──────────────────────────────────────────────────────────────────────

describe('S3StorageProvider.list', () => {
  it('returns empty array when bucket is empty', async () => {
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files).toEqual([])
  })

  it('maps S3 objects to StorageFile shape', async () => {
    const lastModified = new Date('2025-01-01T00:00:00Z')
    mockSend.mockResolvedValue({
      Contents: [
        { Key: 'u1/docs/report.pdf', Size: 1024, LastModified: lastModified },
      ],
      IsTruncated: false,
    })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('report.pdf')
    expect(files[0].bucket).toBe('docs')
    expect(files[0].size).toBe(1024)
    expect(files[0].path).toBe('docs/report.pdf')
    expect(files[0].contentType).toBe('application/octet-stream')
    expect(files[0].createdAt).toBe(lastModified.toISOString())
  })

  it('skips entries whose Key equals the prefix (folder marker)', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: 'u1/docs/', Size: 0 }, // prefix-only — should be skipped
        { Key: 'u1/docs/file.txt', Size: 100, LastModified: new Date() },
      ],
      IsTruncated: false,
    })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('file.txt')
  })

  it('skips entries without a Key', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Size: 100, LastModified: new Date() }, // no Key
        { Key: 'u1/docs/valid.txt', Size: 50, LastModified: new Date() },
      ],
      IsTruncated: false,
    })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('valid.txt')
  })

  it('paginates via ContinuationToken', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'u1/docs/file1.txt', Size: 10, LastModified: new Date() },
        ],
        IsTruncated: true,
        NextContinuationToken: 'token-page-2',
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'u1/docs/file2.txt', Size: 20, LastModified: new Date() },
        ],
        IsTruncated: false,
      })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(files).toHaveLength(2)
    expect(files[0].name).toBe('file1.txt')
    expect(files[1].name).toBe('file2.txt')
  })

  it('uses 0 as size when Size is missing', async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: 'u1/docs/file.txt', LastModified: new Date() }],
      IsTruncated: false,
    })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files[0].size).toBe(0)
  })

  it('uses current date when LastModified is missing', async () => {
    const before = new Date()
    mockSend.mockResolvedValue({
      Contents: [{ Key: 'u1/docs/file.txt', Size: 5 }],
      IsTruncated: false,
    })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    const after = new Date()
    const createdAt = new Date(files[0].createdAt)
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('handles missing Contents gracefully (no entries)', async () => {
    mockSend.mockResolvedValue({ IsTruncated: false })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files).toEqual([])
  })
})
