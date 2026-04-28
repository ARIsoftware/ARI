/**
 * Sanitize a user-provided filename for safe filesystem storage.
 * Transforms the name: strips traversal, replaces unsafe chars, limits length.
 * Use for upload (user input). For stored filenames, use validateStoredFilename().
 */
export function sanitizeFilename(name: string): string {
  let sanitized = name
  sanitized = sanitized.replace(/\0/g, '')
  while (sanitized.includes('..')) sanitized = sanitized.replace(/\.\./g, '')
  sanitized = sanitized.replace(/[/\\]/g, '')
  sanitized = sanitized.replace(/^\.+/, '')
  sanitized = sanitized.replace(/[^a-zA-Z0-9\-_. ]/g, '_')
  sanitized = sanitized.replace(/_{2,}/g, '_')
  sanitized = sanitized.replace(/ {2,}/g, ' ')
  sanitized = sanitized.trim()

  if (!sanitized || sanitized === '_') {
    return 'unnamed'
  }

  if (sanitized.length > 200) {
    const lastDot = sanitized.lastIndexOf('.')
    if (lastDot > 0) {
      const ext = sanitized.slice(lastDot)
      const base = sanitized.slice(0, 200 - ext.length)
      sanitized = base + ext
    } else {
      sanitized = sanitized.slice(0, 200)
    }
  }

  return sanitized
}

/**
 * Validate a stored filename (returned by upload/list) for safe retrieval.
 * Rejects path traversal and unsafe patterns without transforming the name.
 * Returns null if the filename is unsafe.
 */
export function validateStoredFilename(name: string): string | null {
  if (!name) return null
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    return null
  }
  if (name.startsWith('.')) return null
  return name
}

/**
 * Sanitize a bucket name for safe filesystem use.
 * Lowercase alphanumeric + hyphens only, max 64 chars. Throws on empty result.
 */
export function sanitizeBucketName(name: string): string {
  let sanitized = name.toLowerCase()
  sanitized = sanitized.replace(/[^a-z0-9-]/g, '')
  sanitized = sanitized.replace(/-{2,}/g, '-')
  sanitized = sanitized.replace(/^-+|-+$/g, '')
  sanitized = sanitized.slice(0, 64)

  if (!sanitized) {
    throw new Error('Invalid bucket name: must contain at least one alphanumeric character')
  }

  return sanitized
}
