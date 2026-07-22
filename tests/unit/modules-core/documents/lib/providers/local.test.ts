import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the ARI storage backend so we don't need a real filesystem
const mockAriProvider = {
  upload: vi.fn(),
  serve: vi.fn(),
  delete: vi.fn(),
}

vi.mock('@/lib/storage', () => ({
  getStorageProvider: vi.fn(() => mockAriProvider),
}))

import { LocalFilesystemProvider, LOCAL_BUCKET } from '@/modules-core/documents/lib/providers/local'

const USER_ID = 'user-123'
const FILENAME = 'document.pdf'
const PATH = `${USER_ID}/${FILENAME}`

describe('LOCAL_BUCKET constant', () => {
  it('equals "documents"', () => {
    expect(LOCAL_BUCKET).toBe('documents')
  })
})

describe('LocalFilesystemProvider — parsePath (via public methods)', () => {
  it('throws local_invalid_path when path has no slash', async () => {
    const provider = new LocalFilesystemProvider()
    await expect(provider.download('noslash')).rejects.toThrow('local_invalid_path')
  })

  it('throws local_invalid_path when slash is at index 0', async () => {
    const provider = new LocalFilesystemProvider()
    await expect(provider.download('/filename')).rejects.toThrow('local_invalid_path')
  })
})

describe('LocalFilesystemProvider — upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads a Buffer and returns path + size', async () => {
    mockAriProvider.upload.mockResolvedValueOnce({ name: FILENAME })
    const provider = new LocalFilesystemProvider()
    const content = Buffer.from('hello world')
    const result = await provider.upload(USER_ID, FILENAME, content, 'application/pdf')
    expect(result.path).toBe(PATH)
    expect(result.size).toBe(content.length)
    expect(mockAriProvider.upload).toHaveBeenCalledWith(USER_ID, LOCAL_BUCKET, FILENAME, content, 'application/pdf')
  })

  it('converts Blob to Buffer before uploading', async () => {
    mockAriProvider.upload.mockResolvedValueOnce({ name: FILENAME })
    const provider = new LocalFilesystemProvider()
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const result = await provider.upload(USER_ID, FILENAME, blob, 'text/plain')
    expect(result.size).toBe(5)
  })

  it('uses bucketOverride when provided', async () => {
    mockAriProvider.upload.mockResolvedValueOnce({ name: FILENAME })
    const provider = new LocalFilesystemProvider('custom-bucket')
    const content = Buffer.from('x')
    await provider.upload(USER_ID, FILENAME, content, 'application/octet-stream')
    expect(mockAriProvider.upload).toHaveBeenCalledWith(USER_ID, 'custom-bucket', FILENAME, content, 'application/octet-stream')
  })
})

describe('LocalFilesystemProvider — download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('downloads and concatenates stream chunks', async () => {
    const chunk1 = new Uint8Array([1, 2, 3])
    const chunk2 = new Uint8Array([4, 5])
    let callCount = 0
    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) return { done: false, value: chunk1 }
        if (callCount === 2) return { done: false, value: chunk2 }
        return { done: true, value: undefined }
      }),
    }
    const mockStream = { getReader: vi.fn().mockReturnValue(mockReader) }
    mockAriProvider.serve.mockResolvedValueOnce({ stream: mockStream })

    const provider = new LocalFilesystemProvider()
    const result = await provider.download(PATH)
    expect(result).toBeInstanceOf(Buffer)
    expect(result).toEqual(Buffer.from([1, 2, 3, 4, 5]))
  })

  it('throws local_download_failed when serve returns null', async () => {
    mockAriProvider.serve.mockResolvedValueOnce(null)
    const provider = new LocalFilesystemProvider()
    await expect(provider.download(PATH)).rejects.toThrow('local_download_failed')
  })
})

describe('LocalFilesystemProvider — getSignedUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns authenticated serve URL with owner param', async () => {
    const provider = new LocalFilesystemProvider()
    const url = await provider.getSignedUrl(PATH)
    expect(url).toBe(`/api/storage/serve/${LOCAL_BUCKET}/${FILENAME}?owner=${encodeURIComponent(USER_ID)}`)
  })

  it('ignores expiresInSeconds (filesystem has no real signed URLs)', async () => {
    const provider = new LocalFilesystemProvider()
    const url1 = await provider.getSignedUrl(PATH, 60)
    const url2 = await provider.getSignedUrl(PATH, 3600)
    expect(url1).toBe(url2)
  })

  it('uses bucketOverride in URL', async () => {
    const provider = new LocalFilesystemProvider('my-bucket')
    const url = await provider.getSignedUrl(PATH)
    expect(url).toContain('/my-bucket/')
  })
})

describe('LocalFilesystemProvider — delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls ari.delete with correct args', async () => {
    mockAriProvider.delete.mockResolvedValueOnce(undefined)
    const provider = new LocalFilesystemProvider()
    await provider.delete(PATH)
    expect(mockAriProvider.delete).toHaveBeenCalledWith(USER_ID, LOCAL_BUCKET, FILENAME)
  })
})

describe('LocalFilesystemProvider — exists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when serve returns a result', async () => {
    const mockStream = { cancel: vi.fn().mockResolvedValueOnce(undefined) }
    mockAriProvider.serve.mockResolvedValueOnce({ stream: mockStream })
    const provider = new LocalFilesystemProvider()
    const result = await provider.exists(PATH)
    expect(result).toBe(true)
    expect(mockStream.cancel).toHaveBeenCalled()
  })

  it('returns false when serve returns null', async () => {
    mockAriProvider.serve.mockResolvedValueOnce(null)
    const provider = new LocalFilesystemProvider()
    const result = await provider.exists(PATH)
    expect(result).toBe(false)
  })

  it('handles stream.cancel rejection gracefully', async () => {
    const mockStream = { cancel: vi.fn().mockRejectedValueOnce(new Error('cancel failed')) }
    mockAriProvider.serve.mockResolvedValueOnce({ stream: mockStream })
    const provider = new LocalFilesystemProvider()
    const result = await provider.exists(PATH)
    expect(result).toBe(true)
  })
})
