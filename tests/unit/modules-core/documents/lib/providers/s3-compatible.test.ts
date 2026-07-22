import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock AWS SDK modules before importing S3CompatibleProvider
const mockSend = vi.fn()
const mockGetSignedUrl = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: mockSend } }),
  PutObjectCommand: vi.fn(function (input: unknown) { return { type: 'PutObject', input } }),
  GetObjectCommand: vi.fn(function (input: unknown) { return { type: 'GetObject', input } }),
  DeleteObjectCommand: vi.fn(function (input: unknown) { return { type: 'DeleteObject', input } }),
  HeadObjectCommand: vi.fn(function (input: unknown) { return { type: 'HeadObject', input } }),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}))

import { S3Client } from '@aws-sdk/client-s3'
import { S3CompatibleProvider } from '@/modules-core/documents/lib/providers/s3-compatible'

const BUCKET = 'test-bucket'
const USER_ID = 'user-456'
const FILENAME = 'report.pdf'
const PATH = `${USER_ID}/${FILENAME}`

function makeProvider(label: 's3' | 'r2' | 'supabase' = 's3') {
  // The S3Client mock constructor returns { send: mockSend }
  const client = new S3Client({}) as unknown as S3Client
  return new S3CompatibleProvider(client, BUCKET, label)
}

describe('S3CompatibleProvider — upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads a Buffer and returns path + size', async () => {
    mockSend.mockResolvedValueOnce({})
    const provider = makeProvider()
    const content = Buffer.from('hello world')
    const result = await provider.upload(USER_ID, FILENAME, content, 'application/pdf')
    expect(result.path).toBe(PATH)
    expect(result.size).toBe(content.length)
  })

  it('converts Blob to Buffer before uploading', async () => {
    mockSend.mockResolvedValueOnce({})
    const provider = makeProvider()
    const blob = new Blob(['test data'], { type: 'text/plain' })
    const result = await provider.upload(USER_ID, FILENAME, blob, 'text/plain')
    expect(result.size).toBe(9)
  })

  it('sends PutObjectCommand with correct params', async () => {
    mockSend.mockResolvedValueOnce({})
    const provider = makeProvider('r2')
    const content = Buffer.from('data')
    await provider.upload(USER_ID, FILENAME, content, 'image/png')

    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: BUCKET,
      Key: PATH,
      Body: content,
      ContentType: 'image/png',
    })
  })

  it('wraps upload errors with stable code', async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error('AccessDenied'), { name: 'AccessDenied', statusCode: 403 }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const provider = makeProvider('s3')
    await expect(provider.upload(USER_ID, FILENAME, Buffer.from('x'), 'text/plain')).rejects.toThrow('s3_upload_failed')
    consoleSpy.mockRestore()
  })
})

describe('S3CompatibleProvider — download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('downloads object and returns Buffer', async () => {
    const data = new Uint8Array([10, 20, 30])
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => data },
    })
    const provider = makeProvider()
    const result = await provider.download(PATH)
    expect(result).toBeInstanceOf(Buffer)
    expect(result).toEqual(Buffer.from(data))
  })

  it('sends GetObjectCommand with correct params', async () => {
    const data = new Uint8Array([1])
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => data },
    })
    const provider = makeProvider()
    await provider.download(PATH)

    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: BUCKET,
      Key: PATH,
    })
  })

  it('throws when Body is missing', async () => {
    mockSend.mockResolvedValueOnce({ Body: undefined })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const provider = makeProvider()
    await expect(provider.download(PATH)).rejects.toThrow('s3_download_failed')
    consoleSpy.mockRestore()
  })

  it('wraps download errors with stable code', async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey', statusCode: 404 }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const provider = makeProvider('r2')
    await expect(provider.download(PATH)).rejects.toThrow('r2_download_failed')
    consoleSpy.mockRestore()
  })
})

describe('S3CompatibleProvider — getSignedUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns presigned URL', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url')
    const provider = makeProvider()
    const url = await provider.getSignedUrl(PATH)
    expect(url).toBe('https://s3.example.com/signed-url')
  })

  it('uses default expiry of 300 seconds', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url')
    const provider = makeProvider()
    await provider.getSignedUrl(PATH)
    const [, , options] = mockGetSignedUrl.mock.calls[0]
    expect(options.expiresIn).toBe(300)
  })

  it('uses custom expiry when provided', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url')
    const provider = makeProvider()
    await provider.getSignedUrl(PATH, 3600)
    const [, , options] = mockGetSignedUrl.mock.calls[0]
    expect(options.expiresIn).toBe(3600)
  })

  it('sets ResponseContentDisposition with filename when opts.filename provided', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url')
    const provider = makeProvider()
    await provider.getSignedUrl(PATH, 300, { filename: 'my report.pdf' })

    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    // Find the call that had ResponseContentDisposition
    const cmdCall = vi.mocked(GetObjectCommand).mock.calls.find((args) =>
      (args[0] as { ResponseContentDisposition?: string }).ResponseContentDisposition?.includes('my%20report.pdf')
    )
    expect(cmdCall).toBeDefined()
  })

  it('sets default attachment disposition when no filename', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-url')
    const provider = makeProvider()
    await provider.getSignedUrl(PATH)

    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const lastCall = vi.mocked(GetObjectCommand).mock.calls.at(-1)!
    expect((lastCall[0] as { ResponseContentDisposition: string }).ResponseContentDisposition).toBe('attachment')
  })
})

describe('S3CompatibleProvider — delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends DeleteObjectCommand', async () => {
    mockSend.mockResolvedValueOnce({})
    const provider = makeProvider()
    await provider.delete(PATH)

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: BUCKET,
      Key: PATH,
    })
  })

  it('wraps delete errors with stable code', async () => {
    mockSend.mockRejectedValueOnce(new Error('Permission denied'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const provider = makeProvider('supabase')
    await expect(provider.delete(PATH)).rejects.toThrow('supabase_delete_failed')
    consoleSpy.mockRestore()
  })
})

describe('S3CompatibleProvider — exists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when HeadObject succeeds', async () => {
    mockSend.mockResolvedValueOnce({})
    const provider = makeProvider()
    const result = await provider.exists(PATH)
    expect(result).toBe(true)
  })

  it('returns false when HeadObject throws', async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error('NotFound'), { name: 'NotFound', statusCode: 404 }))
    const provider = makeProvider()
    const result = await provider.exists(PATH)
    expect(result).toBe(false)
  })

  it('sends HeadObjectCommand with correct params', async () => {
    mockSend.mockResolvedValueOnce({})
    const provider = makeProvider()
    await provider.exists(PATH)

    const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
    expect(HeadObjectCommand).toHaveBeenCalledWith({
      Bucket: BUCKET,
      Key: PATH,
    })
  })
})
