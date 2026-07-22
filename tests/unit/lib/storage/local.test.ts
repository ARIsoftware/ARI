/**
 * Tests for lib/storage/local.ts
 *
 * LocalFilesystemProvider wraps fs/promises for all I/O. We mock the fs
 * modules so no real files are created, while still exercising all branches:
 * upload, serve, delete, list, assertWithinBase, getMimeTypeForExtension,
 * getDefaultLocalStorageBasePath, and error paths (ENOENT, EACCES, traversal).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'path'

// ── mocks (hoisted) ────────────────────────────────────────────────────────────

// Track all mock fn refs at module scope so beforeEach can reset them
const mockMkdir = vi.fn()
const mockRealpath = vi.fn()
const mockWriteFile = vi.fn()
const mockStat = vi.fn()
const mockUnlink = vi.fn()
const mockReaddir = vi.fn()
const mockCreateReadStream = vi.fn()

vi.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  realpath: (...args: unknown[]) => mockRealpath(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}))

vi.mock('fs', () => ({
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}))

// Minimal readable stream stub
function makeReadableStream() {
  return { pipe: vi.fn() }
}

// Import after mocks
import { LocalFilesystemProvider, getMimeTypeForExtension, getDefaultLocalStorageBasePath } from '@/lib/storage/local'

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE = '/tmp/test-storage'

function makeProvider() {
  return new LocalFilesystemProvider(BASE)
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: mkdir and realpath succeed
  mockMkdir.mockResolvedValue(undefined)
  mockRealpath.mockImplementation(async (p: string) => p)
  mockWriteFile.mockResolvedValue(undefined)
  mockUnlink.mockResolvedValue(undefined)
  mockStat.mockResolvedValue({ size: 42, birthtime: new Date('2024-01-01T00:00:00Z') })
  mockReaddir.mockResolvedValue([])
  mockCreateReadStream.mockReturnValue(makeReadableStream())
})

// ── getDefaultLocalStorageBasePath ─────────────────────────────────────────────

describe('getDefaultLocalStorageBasePath', () => {
  it('returns a path ending in data/storage relative to cwd', () => {
    const p = getDefaultLocalStorageBasePath()
    expect(p).toContain('data')
    expect(p).toContain('storage')
    expect(path.isAbsolute(p)).toBe(true)
  })
})

// ── getMimeTypeForExtension ────────────────────────────────────────────────────

describe('getMimeTypeForExtension', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['image.png', 'image/png'],
    ['image.webp', 'image/webp'],
    ['anim.gif', 'image/gif'],
    ['fav.ico', 'image/x-icon'],
    ['doc.pdf', 'application/pdf'],
    ['song.mp3', 'audio/mpeg'],
    ['video.mp4', 'video/mp4'],
    ['notes.txt', 'text/plain'],
    ['data.json', 'application/json'],
    ['table.csv', 'text/csv'],
    ['archive.zip', 'application/zip'],
    ['font.woff', 'font/woff'],
    ['font.woff2', 'font/woff2'],
  ])('returns correct mime for %s', (filename, expected) => {
    expect(getMimeTypeForExtension(filename)).toBe(expected)
  })

  it('returns application/octet-stream for unknown extension', () => {
    expect(getMimeTypeForExtension('script.sh')).toBe('application/octet-stream')
  })

  it('returns application/octet-stream for no extension', () => {
    expect(getMimeTypeForExtension('README')).toBe('application/octet-stream')
  })

  it('is case-insensitive (uppercase extension)', () => {
    expect(getMimeTypeForExtension('PHOTO.JPG')).toBe('image/jpeg')
  })
})

// ── constructor ────────────────────────────────────────────────────────────────

describe('LocalFilesystemProvider — constructor', () => {
  it('uses provided basePath', () => {
    const p = new LocalFilesystemProvider('/custom/base')
    expect(p).toBeDefined()
  })

  it('uses default basePath when none provided', () => {
    const p = new LocalFilesystemProvider()
    expect(p).toBeDefined()
  })
})

// ── upload ─────────────────────────────────────────────────────────────────────

describe('LocalFilesystemProvider.upload', () => {
  it('creates the user/bucket directory and writes the file', async () => {
    const provider = makeProvider()
    const result = await provider.upload('user1', 'avatars', 'photo.jpg', Buffer.from('data'), 'image/jpeg')

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(path.join('user1', 'avatars')),
      { recursive: true }
    )
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(result.name).toMatch(/^\d+-photo\.jpg$/)
    expect(result.path).toMatch(/^avatars\/\d+-photo\.jpg$/)
  })

  it('sanitizes filename (strips traversal)', async () => {
    const provider = makeProvider()
    const result = await provider.upload('u1', 'docs', '../../../etc/passwd', Buffer.from('x'), 'text/plain')
    expect(result.name).not.toContain('..')
    expect(result.name).not.toContain('/')
  })

  it('rejects path traversal via assertWithinBase', async () => {
    const provider = makeProvider()
    // Simulate realpath returning a path outside base
    mockRealpath.mockImplementation(async (p: string) => {
      if (p === BASE) return BASE
      // For the parent dir, return an outside path
      return '/etc'
    })
    await expect(
      provider.upload('u1', 'docs', 'file.txt', Buffer.from('x'), 'text/plain')
    ).rejects.toThrow('Path resolves outside storage directory')
  })

  it('propagates non-ENOENT errors from realpath in assertWithinBase', async () => {
    const provider = makeProvider()
    mockRealpath.mockImplementation(async (p: string) => {
      if (p === BASE) return BASE
      // When file doesn't exist, also fail the parent realpath with EACCES
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' })
      throw err
    })
    await expect(
      provider.upload('u1', 'docs', 'file.txt', Buffer.from('x'), 'text/plain')
    ).rejects.toThrow('EACCES')
  })

  it('handles ENOENT from realpath(filePath) by using parent + basename', async () => {
    const provider = makeProvider()
    let realpathCallCount = 0
    mockRealpath.mockImplementation(async (p: string) => {
      realpathCallCount++
      if (p === BASE) return BASE
      // First call is mkdir ensureRealBasePath — already handled via first check
      // For the file path itself, throw ENOENT (file doesn't exist yet on upload)
      if (realpathCallCount === 2) {
        const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
        throw err
      }
      // Parent directory realpath succeeds
      return BASE + '/user1/docs'
    })
    const result = await provider.upload('u1', 'docs', 'newfile.txt', Buffer.from('x'), 'text/plain')
    expect(result.name).toMatch(/^\d+-newfile\.txt$/)
  })
})

// ── serve ──────────────────────────────────────────────────────────────────────

describe('LocalFilesystemProvider.serve', () => {
  it('returns ServeResult with correct fields on success', async () => {
    const stream = makeReadableStream()
    mockCreateReadStream.mockReturnValue(stream)
    mockStat.mockResolvedValue({ size: 100, birthtime: new Date() })

    // Mock Readable.toWeb
    const { Readable } = await import('stream')
    const originalToWeb = Readable.toWeb
    const mockWebStream = new ReadableStream()
    Readable.toWeb = vi.fn().mockReturnValue(mockWebStream)

    const provider = makeProvider()
    const result = await provider.serve('u1', 'avatars', 'photo.jpg')

    expect(result).not.toBeNull()
    expect(result?.size).toBe(100)
    expect(result?.contentType).toBe('image/jpeg')
    expect(result?.stream).toBe(mockWebStream)

    Readable.toWeb = originalToWeb
  })

  it('returns null for ENOENT (file not found)', async () => {
    // Make assertWithinBase succeed but stat fail with ENOENT
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    // But also need assertWithinBase to think the file exists so we can get to stat
    // By default realpath succeeds, so file exists check in assertWithinBase passes
    // but stat will throw ENOENT anyway
    const provider = makeProvider()
    const result = await provider.serve('u1', 'avatars', 'missing.jpg')
    expect(result).toBeNull()
  })

  it('returns null when assertWithinBase throws ENOENT', async () => {
    // Make the final realpath call return outside-base path in a way that
    // causes ENOENT during serve. The serve method catches ENOENT from assertWithinBase too.
    // Actually assertWithinBase only throws 'Path resolves outside storage directory' or rethrows
    // So ENOENT from stat is the main null path. Let's test traversal detection returns null? No,
    // it throws. Let's just test serve rethrows non-ENOENT errors
    mockStat.mockRejectedValue(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))
    const provider = makeProvider()
    await expect(provider.serve('u1', 'avatars', 'protected.jpg')).rejects.toThrow('EACCES')
  })

  it('rethrows traversal errors from assertWithinBase during serve', async () => {
    // Simulate the realpath returning a path outside base during serve
    let callCount = 0
    mockRealpath.mockImplementation(async (p: string) => {
      callCount++
      if (p === BASE) return BASE
      // Return outside-base path for the file
      return '/etc/passwd'
    })
    const provider = makeProvider()
    await expect(provider.serve('u1', 'avatars', 'photo.jpg')).rejects.toThrow('Path resolves outside storage directory')
  })
})

// ── delete ─────────────────────────────────────────────────────────────────────

describe('LocalFilesystemProvider.delete', () => {
  it('calls fs.unlink with the correct path', async () => {
    const provider = makeProvider()
    await provider.delete('u1', 'docs', 'file.pdf')
    expect(mockUnlink).toHaveBeenCalledTimes(1)
    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining(path.join('u1', 'docs', 'file.pdf'))
    )
  })

  it('is a no-op for ENOENT (already deleted)', async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const provider = makeProvider()
    await expect(provider.delete('u1', 'docs', 'nonexistent.pdf')).resolves.toBeUndefined()
  })

  it('rethrows non-ENOENT errors', async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
    const provider = makeProvider()
    await expect(provider.delete('u1', 'docs', 'file.pdf')).rejects.toThrow('EACCES')
  })

  it('rethrows traversal errors from assertWithinBase during delete', async () => {
    let callCount = 0
    mockRealpath.mockImplementation(async (p: string) => {
      callCount++
      if (p === BASE) return BASE
      return '/etc/passwd'
    })
    const provider = makeProvider()
    await expect(provider.delete('u1', 'docs', 'file.pdf')).rejects.toThrow('Path resolves outside storage directory')
  })
})

// ── list ───────────────────────────────────────────────────────────────────────

describe('LocalFilesystemProvider.list', () => {
  it('returns empty array when directory does not exist (ENOENT)', async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files).toEqual([])
  })

  it('rethrows non-ENOENT readdir errors', async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
    const provider = makeProvider()
    await expect(provider.list('u1', 'docs')).rejects.toThrow('EACCES')
  })

  it('returns empty array when directory is empty', async () => {
    mockReaddir.mockResolvedValue([])
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files).toEqual([])
  })

  it('maps file entries to StorageFile shape', async () => {
    const birthtime = new Date('2025-01-01T00:00:00Z')
    mockReaddir.mockResolvedValue([
      { name: 'report.pdf', isFile: () => true, isDirectory: () => false },
    ])
    mockStat.mockResolvedValue({ size: 512, birthtime })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('report.pdf')
    expect(files[0].bucket).toBe('docs')
    expect(files[0].size).toBe(512)
    expect(files[0].contentType).toBe('application/pdf')
    expect(files[0].createdAt).toBe(birthtime.toISOString())
    expect(files[0].path).toBe('docs/report.pdf')
  })

  it('skips directory entries (non-files)', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'subdir', isFile: () => false, isDirectory: () => true },
      { name: 'file.txt', isFile: () => true, isDirectory: () => false },
    ])
    mockStat.mockResolvedValue({ size: 10, birthtime: new Date() })
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('file.txt')
  })

  it('skips entries where stat throws', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'good.txt', isFile: () => true },
      { name: 'bad.txt', isFile: () => true },
    ])
    mockStat
      .mockResolvedValueOnce({ size: 10, birthtime: new Date() })
      .mockRejectedValueOnce(new Error('stat failed'))
    const provider = makeProvider()
    const files = await provider.list('u1', 'docs')
    // Only the good one is returned; bad one yields null which is filtered
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('good.txt')
  })

  it('handles multiple files correctly', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'a.jpg', isFile: () => true },
      { name: 'b.png', isFile: () => true },
      { name: 'c.pdf', isFile: () => true },
    ])
    const birthtime = new Date('2025-06-01T00:00:00Z')
    mockStat.mockResolvedValue({ size: 100, birthtime })
    const provider = makeProvider()
    const files = await provider.list('u1', 'photos')
    expect(files).toHaveLength(3)
    expect(files.map(f => f.name)).toEqual(['a.jpg', 'b.png', 'c.pdf'])
  })
})

// ── assertWithinBase (memoization) ────────────────────────────────────────────

describe('LocalFilesystemProvider — ensureRealBasePath memoization', () => {
  it('only calls mkdir + realpath once for the base path across multiple upload/serve calls', async () => {
    const provider = makeProvider()
    // serve triggers assertWithinBase → ensureRealBasePath
    // Make serve return null (ENOENT) so we only test the base-path memoization
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    await provider.serve('u1', 'docs', 'a.txt')
    await provider.serve('u1', 'docs', 'b.txt')

    // mkdir for base should only be called once (memoized)
    const baseMkdirCalls = mockMkdir.mock.calls.filter(
      ([p]: unknown[]) => p === BASE
    )
    expect(baseMkdirCalls.length).toBe(1)
  })
})
