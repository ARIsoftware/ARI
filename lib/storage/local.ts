import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import type { StorageProvider, StorageFile, UploadResult, ServeResult } from './types'
import { sanitizeFilename } from './sanitize'

/**
 * Safe MIME map — excludes executable types (HTML, SVG, JS, CSS) to prevent stored XSS.
 * Those extensions are served as application/octet-stream instead.
 */
const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

/** Exported for upload route to validate extensions against allowed MIME types */
export function getMimeTypeForExtension(filename: string): string {
  return getMimeType(filename)
}

export class LocalFilesystemProvider implements StorageProvider {
  private basePath: string
  private realBasePathPromise: Promise<string> | null = null

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(process.cwd(), 'data', 'storage')
  }

  private getUserBucketDir(userId: string, bucket: string): string {
    return path.join(this.basePath, userId, bucket)
  }

  /**
   * Ensure the storage root exists and return its realpath. Memoized as a promise so
   * concurrent first callers don't all race mkdir+realpath. mkdir is required because
   * fs.realpath would otherwise ENOENT on a fresh install before any upload.
   */
  private ensureRealBasePath(): Promise<string> {
    if (!this.realBasePathPromise) {
      this.realBasePathPromise = (async () => {
        await fs.mkdir(this.basePath, { recursive: true })
        return fs.realpath(this.basePath)
      })()
    }
    return this.realBasePathPromise
  }

  async upload(
    userId: string,
    bucket: string,
    filename: string,
    data: Buffer,
    _contentType: string
  ): Promise<UploadResult> {
    // Defense-in-depth: callers (e.g. upload route) already sanitize, but the provider
    // contract should not trust unvalidated input. Reject any traversal-bearing filename.
    const safeName = sanitizeFilename(filename)
    const dir = this.getUserBucketDir(userId, bucket)
    await fs.mkdir(dir, { recursive: true })

    const storedName = `${Date.now()}-${safeName}`
    const filePath = path.join(dir, storedName)
    await this.assertWithinBase(filePath)
    await fs.writeFile(filePath, data)

    return {
      path: `${bucket}/${storedName}`,
      name: storedName,
    }
  }

  /**
   * Verify resolved path stays within the base storage directory. Uses path.relative
   * against the realpathed base so sibling-prefix paths (e.g. /tmp/storage-escape vs
   * /tmp/storage) and symlink escapes are rejected.
   */
  private async assertWithinBase(filePath: string): Promise<void> {
    const realBase = await this.ensureRealBasePath()
    let real: string
    try {
      real = await fs.realpath(filePath)
    } catch (err: unknown) {
      // Only fall back to parent-realpath when the file itself doesn't exist (upload case).
      // Any other error (e.g. EACCES on a parent) must propagate, not be swallowed.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
      const parent = await fs.realpath(path.dirname(filePath))
      real = path.join(parent, path.basename(filePath))
    }
    const rel = path.relative(realBase, real)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Path resolves outside storage directory')
    }
  }

  async serve(
    userId: string,
    bucket: string,
    filename: string
  ): Promise<ServeResult | null> {
    const filePath = path.join(this.getUserBucketDir(userId, bucket), filename)

    try {
      await this.assertWithinBase(filePath)
      const stat = await fs.stat(filePath)
      const nodeStream = fsSync.createReadStream(filePath)
      const webStream = Readable.toWeb(nodeStream) as ReadableStream

      return {
        stream: webStream,
        contentType: getMimeType(filename),
        size: stat.size,
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
      throw err
    }
  }

  async delete(userId: string, bucket: string, filename: string): Promise<void> {
    const filePath = path.join(this.getUserBucketDir(userId, bucket), filename)

    try {
      await this.assertWithinBase(filePath)
      await fs.unlink(filePath)
    } catch (err: unknown) {
      // Deleting a nonexistent file is a no-op
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return
      throw err
    }
  }

  async list(userId: string, bucket: string): Promise<StorageFile[]> {
    const dir = this.getUserBucketDir(userId, bucket)

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return []
      throw err
    }

    const fileEntries = entries.filter(e => e.isFile())
    const results = await Promise.all(
      fileEntries.map(async (entry) => {
        try {
          const filePath = path.join(dir, entry.name)
          const stat = await fs.stat(filePath)
          return {
            name: entry.name,
            bucket,
            size: stat.size,
            contentType: getMimeType(entry.name),
            createdAt: stat.birthtime.toISOString(),
            path: `${bucket}/${entry.name}`,
          } satisfies StorageFile
        } catch {
          return null
        }
      })
    )

    return results.filter((f): f is StorageFile => f !== null)
  }
}
