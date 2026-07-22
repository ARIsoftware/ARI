import { describe, it, expect } from 'vitest'
import {
  sanitizeFilename,
  validateStoredFilename,
  sanitizeBucketName,
} from '@/lib/storage/sanitize'

// ─── sanitizeFilename ────────────────────────────────────────────────────────

describe('sanitizeFilename — basic happy path', () => {
  it('returns a plain safe filename unchanged', () => {
    expect(sanitizeFilename('hello.txt')).toBe('hello.txt')
  })

  it('preserves underscores, hyphens and spaces', () => {
    expect(sanitizeFilename('my-file_name here.pdf')).toBe('my-file_name here.pdf')
  })
})

describe('sanitizeFilename — null-byte stripping', () => {
  it('removes null bytes', () => {
    expect(sanitizeFilename('file\0name.txt')).toBe('filename.txt')
  })
})

describe('sanitizeFilename — path traversal', () => {
  it('removes double-dots', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd')
  })

  it('removes forward slashes', () => {
    expect(sanitizeFilename('dir/subdir/file.txt')).toBe('dirsubdirfile.txt')
  })

  it('removes backslashes', () => {
    expect(sanitizeFilename('dir\\file.txt')).toBe('dirfile.txt')
  })
})

describe('sanitizeFilename — leading dots (hidden files)', () => {
  it('strips leading dots', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden')
  })

  it('strips multiple leading dots', () => {
    expect(sanitizeFilename('...bashrc')).toBe('bashrc')
  })
})

describe('sanitizeFilename — unsafe characters', () => {
  it('replaces special chars with underscores', () => {
    expect(sanitizeFilename('file<name>.txt')).toBe('file_name_.txt')
  })

  it('collapses consecutive underscores created by replacement', () => {
    expect(sanitizeFilename('a!!b.txt')).toBe('a_b.txt')
  })

  it('collapses consecutive spaces', () => {
    expect(sanitizeFilename('a   b.txt')).toBe('a b.txt')
  })
})

describe('sanitizeFilename — empty / degenerate results', () => {
  it('returns "unnamed" for an empty string', () => {
    expect(sanitizeFilename('')).toBe('unnamed')
  })

  it('returns "unnamed" for string that becomes just underscore', () => {
    // A string that reduces to "_" after replacements → "unnamed"
    expect(sanitizeFilename('!')).toBe('unnamed')
  })

  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello')
  })
})

describe('sanitizeFilename — length truncation', () => {
  it('truncates to 200 chars, preserving extension', () => {
    const base = 'a'.repeat(210)
    const ext = '.txt'
    const result = sanitizeFilename(base + ext)
    expect(result.length).toBeLessThanOrEqual(200)
    expect(result.endsWith('.txt')).toBe(true)
  })

  it('truncates to 200 chars when there is no extension', () => {
    const long = 'a'.repeat(250)
    const result = sanitizeFilename(long)
    expect(result.length).toBe(200)
  })
})

// ─── validateStoredFilename ──────────────────────────────────────────────────

describe('validateStoredFilename — valid names', () => {
  it('returns the name unchanged for a valid filename', () => {
    expect(validateStoredFilename('photo.jpg')).toBe('photo.jpg')
  })

  it('accepts filenames with hyphens and underscores', () => {
    expect(validateStoredFilename('my-image_001.png')).toBe('my-image_001.png')
  })
})

describe('validateStoredFilename — invalid names', () => {
  it('returns null for empty string', () => {
    expect(validateStoredFilename('')).toBe(null)
  })

  it('returns null for double-dot traversal', () => {
    expect(validateStoredFilename('../etc/passwd')).toBe(null)
  })

  it('returns null for forward slash', () => {
    expect(validateStoredFilename('dir/file.txt')).toBe(null)
  })

  it('returns null for backslash', () => {
    expect(validateStoredFilename('dir\\file.txt')).toBe(null)
  })

  it('returns null for null byte', () => {
    expect(validateStoredFilename('file\0name')).toBe(null)
  })

  it('returns null for leading dot (hidden file)', () => {
    expect(validateStoredFilename('.hidden')).toBe(null)
  })
})

// ─── sanitizeBucketName ──────────────────────────────────────────────────────

describe('sanitizeBucketName — valid names', () => {
  it('lowercases and preserves valid chars', () => {
    expect(sanitizeBucketName('MyBucket')).toBe('mybucket')
  })

  it('strips non alphanumeric/hyphen chars', () => {
    expect(sanitizeBucketName('my_bucket!')).toBe('mybucket')
  })

  it('collapses consecutive hyphens', () => {
    expect(sanitizeBucketName('my--bucket')).toBe('my-bucket')
  })

  it('strips leading hyphens', () => {
    expect(sanitizeBucketName('---mybucket')).toBe('mybucket')
  })

  it('strips trailing hyphens', () => {
    expect(sanitizeBucketName('mybucket---')).toBe('mybucket')
  })

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100)
    const result = sanitizeBucketName(long)
    expect(result.length).toBe(64)
  })
})

describe('sanitizeBucketName — invalid (throws)', () => {
  it('throws for a name that reduces to empty string', () => {
    expect(() => sanitizeBucketName('---')).toThrow('Invalid bucket name')
  })

  it('throws for empty string', () => {
    expect(() => sanitizeBucketName('')).toThrow('Invalid bucket name')
  })

  it('throws for a name with only special chars', () => {
    expect(() => sanitizeBucketName('!@#$%')).toThrow('Invalid bucket name')
  })
})
