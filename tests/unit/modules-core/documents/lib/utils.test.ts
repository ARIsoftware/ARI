import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  toastError,
  getStorageProviderLabel,
  getFileIcon,
  formatFileSize,
  formatDate,
  isPreviewableImage,
  getFileExtension,
  truncateFilename,
  validateFolderName,
  buildBreadcrumbPath,
  FOLDER_NAME_PATTERN,
  FOLDER_NAME_MAX_LENGTH,
} from '@/modules-core/documents/lib/utils'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// toastError
// ---------------------------------------------------------------------------
describe('toastError', () => {
  it('calls toast with destructive variant and error message', () => {
    const toast = vi.fn()
    toastError(toast, 'Upload failed', new Error('Network error'))
    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Upload failed',
      description: 'Network error',
    })
  })

  it('uses "Unknown error" for non-Error values', () => {
    const toast = vi.fn()
    toastError(toast, 'Oops', 'some string error')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Unknown error' }))
  })

  it('uses "Unknown error" for null', () => {
    const toast = vi.fn()
    toastError(toast, 'Oops', null)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Unknown error' }))
  })
})

// ---------------------------------------------------------------------------
// getStorageProviderLabel
// ---------------------------------------------------------------------------
describe('getStorageProviderLabel', () => {
  it('returns correct label for supabase', () => {
    expect(getStorageProviderLabel('supabase')).toBe('Supabase Storage')
  })
  it('returns correct label for r2', () => {
    expect(getStorageProviderLabel('r2')).toBe('Cloudflare R2')
  })
  it('returns correct label for s3', () => {
    expect(getStorageProviderLabel('s3')).toBe('AWS S3')
  })
  it('returns correct label for local', () => {
    expect(getStorageProviderLabel('local')).toBe('Local Filesystem')
  })
})

// ---------------------------------------------------------------------------
// getFileIcon — we only check it returns a truthy function (LucideIcon)
// ---------------------------------------------------------------------------
describe('getFileIcon', () => {
  it('returns FileImage for image mimeTypes', () => {
    const icon = getFileIcon('image/png')
    expect(icon).toBeTruthy()
  })

  it('returns FileVideo for video mimeTypes', () => {
    expect(getFileIcon('video/mp4')).toBeTruthy()
  })

  it('returns FileAudio for audio mimeTypes', () => {
    expect(getFileIcon('audio/mpeg')).toBeTruthy()
  })

  it('returns FileJson for application/json', () => {
    expect(getFileIcon('application/json')).toBeTruthy()
  })

  it('returns FileType for Word documents', () => {
    expect(getFileIcon('application/msword')).toBeTruthy()
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeTruthy()
  })

  it('returns FileText for PDF', () => {
    expect(getFileIcon('application/pdf')).toBeTruthy()
  })

  it('returns FileText for text/plain and text/markdown', () => {
    expect(getFileIcon('text/plain')).toBeTruthy()
    expect(getFileIcon('text/markdown')).toBeTruthy()
  })

  it('returns FileSpreadsheet for CSV and spreadsheet types', () => {
    expect(getFileIcon('text/csv')).toBeTruthy()
    expect(getFileIcon('application/vnd.ms-excel')).toBeTruthy()
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBeTruthy()
  })

  it('returns FileCode for code types', () => {
    expect(getFileIcon('application/javascript')).toBeTruthy()
    expect(getFileIcon('text/html')).toBeTruthy()
    expect(getFileIcon('text/css')).toBeTruthy()
    expect(getFileIcon('text/x-python')).toBeTruthy()
    expect(getFileIcon('application/xml')).toBeTruthy()
  })

  it('returns FileArchive for archive types', () => {
    expect(getFileIcon('application/zip')).toBeTruthy()
    expect(getFileIcon('application/x-rar')).toBeTruthy()
    expect(getFileIcon('application/gzip')).toBeTruthy()
  })

  it('returns File (generic) for unknown type', () => {
    expect(getFileIcon('application/octet-stream')).toBeTruthy()
  })

  // Verify distinct icons are returned for distinct categories
  it('image icon differs from generic file icon', () => {
    expect(getFileIcon('image/jpeg')).not.toBe(getFileIcon('application/octet-stream'))
  })
})

// ---------------------------------------------------------------------------
// formatFileSize
// ---------------------------------------------------------------------------
describe('formatFileSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
  })
})

// ---------------------------------------------------------------------------
// formatDate (documents version — relative time format)
// ---------------------------------------------------------------------------
describe('formatDate (documents)', () => {
  it('returns "Just now" for a date less than 1 minute ago', () => {
    const recent = new Date(Date.now() - 30_000).toISOString()
    expect(formatDate(recent)).toBe('Just now')
  })

  it('returns "X minutes ago" for a date a few minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatDate(fiveMinutesAgo)).toBe('5 minutes ago')
  })

  it('returns "1 hour ago" for ~1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
    expect(formatDate(oneHourAgo)).toBe('1 hour ago')
  })

  it('returns "X hours ago" for several hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString()
    expect(formatDate(threeHoursAgo)).toBe('3 hours ago')
  })

  it('returns "Yesterday" for exactly 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 25 * 60 * 60_000).toISOString()
    expect(formatDate(oneDayAgo)).toBe('Yesterday')
  })

  it('returns "X days ago" for several days ago (< 7)', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString()
    expect(formatDate(threeDaysAgo)).toBe('3 days ago')
  })

  it('returns a formatted date string for dates older than 7 days', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString()
    const result = formatDate(twoWeeksAgo)
    // Should not be relative — just a date
    expect(result).not.toContain('ago')
    expect(result).not.toBe('Yesterday')
    expect(typeof result).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// isPreviewableImage
// ---------------------------------------------------------------------------
describe('isPreviewableImage', () => {
  it('returns true for previewable types', () => {
    expect(isPreviewableImage('image/jpeg')).toBe(true)
    expect(isPreviewableImage('image/png')).toBe(true)
    expect(isPreviewableImage('image/gif')).toBe(true)
    expect(isPreviewableImage('image/webp')).toBe(true)
    expect(isPreviewableImage('image/svg+xml')).toBe(true)
  })

  it('returns false for non-previewable types', () => {
    expect(isPreviewableImage('image/tiff')).toBe(false)
    expect(isPreviewableImage('application/pdf')).toBe(false)
    expect(isPreviewableImage('video/mp4')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getFileExtension
// ---------------------------------------------------------------------------
describe('getFileExtension', () => {
  it('returns extension in uppercase', () => {
    expect(getFileExtension('report.pdf')).toBe('PDF')
    expect(getFileExtension('image.PNG')).toBe('PNG')
  })

  it('returns the last extension for files with multiple dots', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('GZ')
  })

  it('returns empty string for files without an extension', () => {
    expect(getFileExtension('Makefile')).toBe('')
  })

  it('returns empty string for empty filename', () => {
    expect(getFileExtension('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// truncateFilename
// ---------------------------------------------------------------------------
describe('truncateFilename', () => {
  it('returns the filename unchanged when within maxLength', () => {
    expect(truncateFilename('short.txt', 30)).toBe('short.txt')
  })

  it('truncates long filenames and preserves extension', () => {
    const long = 'a'.repeat(50) + '.pdf'
    const result = truncateFilename(long, 20)
    expect(result.endsWith('.pdf')).toBe(true)
    expect(result).toContain('...')
    // Total length should not exceed maxLength
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('uses default maxLength of 30', () => {
    const long = 'x'.repeat(40) + '.txt'
    const result = truncateFilename(long)
    expect(result.length).toBeLessThanOrEqual(30)
  })

  it('handles filenames without extension', () => {
    const long = 'a'.repeat(40)
    const result = truncateFilename(long, 20)
    expect(result).toContain('...')
  })
})

// ---------------------------------------------------------------------------
// validateFolderName
// ---------------------------------------------------------------------------
describe('validateFolderName', () => {
  it('returns null for valid names', () => {
    expect(validateFolderName('my-folder')).toBeNull()
    expect(validateFolderName('My_Folder_2025')).toBeNull()
    expect(validateFolderName('A')).toBeNull()
  })

  it('returns error for empty name', () => {
    expect(validateFolderName('')).toBe('Folder name is required')
    expect(validateFolderName('   ')).toBe('Folder name is required')
  })

  it(`returns error for names longer than ${FOLDER_NAME_MAX_LENGTH} characters`, () => {
    const long = 'a'.repeat(FOLDER_NAME_MAX_LENGTH + 1)
    const result = validateFolderName(long)
    expect(result).not.toBeNull()
    expect(result).toContain(`${FOLDER_NAME_MAX_LENGTH}`)
  })

  it('returns error for names with invalid characters', () => {
    expect(validateFolderName('my folder')).not.toBeNull()  // space
    expect(validateFolderName('my.folder')).not.toBeNull()  // dot
    expect(validateFolderName('my/folder')).not.toBeNull()  // slash
  })

  it('FOLDER_NAME_PATTERN matches valid chars', () => {
    expect(FOLDER_NAME_PATTERN.test('hello_world')).toBe(true)
    expect(FOLDER_NAME_PATTERN.test('hello-world')).toBe(true)
    expect(FOLDER_NAME_PATTERN.test('abc123')).toBe(true)
    expect(FOLDER_NAME_PATTERN.test('with space')).toBe(false)
    expect(FOLDER_NAME_PATTERN.test('with.dot')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildBreadcrumbPath
// ---------------------------------------------------------------------------
describe('buildBreadcrumbPath', () => {
  const folders = [
    { id: 'root', name: 'Root', parent_id: null },
    { id: 'child', name: 'Child', parent_id: 'root' },
    { id: 'grandchild', name: 'GrandChild', parent_id: 'child' },
  ]

  it('returns just the Documents root when currentFolderId is null', () => {
    const path = buildBreadcrumbPath(folders, null)
    expect(path).toHaveLength(1)
    expect(path[0]).toEqual({ id: null, name: 'Documents' })
  })

  it('builds a single-level path', () => {
    const path = buildBreadcrumbPath(folders, 'root')
    expect(path).toHaveLength(2)
    expect(path[0].name).toBe('Documents')
    expect(path[1].name).toBe('Root')
  })

  it('builds a two-level path', () => {
    const path = buildBreadcrumbPath(folders, 'child')
    expect(path).toHaveLength(3)
    expect(path[1].name).toBe('Root')
    expect(path[2].name).toBe('Child')
  })

  it('builds a three-level path', () => {
    const path = buildBreadcrumbPath(folders, 'grandchild')
    expect(path).toHaveLength(4)
    expect(path[3].name).toBe('GrandChild')
  })

  it('returns just root path when folderId is not found', () => {
    const path = buildBreadcrumbPath(folders, 'nonexistent')
    // folder not found → buildPath returns without adding anything
    expect(path[0].name).toBe('Documents')
  })
})
