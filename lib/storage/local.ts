import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import type { StorageProvider, StorageFile, UploadResult, ServeResult } from './types'

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

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(process.cwd(), 'data', 'storage')
  }

  private getUserBucketDir(userId: string, bucket: string): string {
    return path.join(this.basePath, userId, bucket)
  }

  async upload(
    userId: string,
    bucket: string,
    filename: string,
    data: Buffer,
    _contentType: string
  ): Promise<UploadResult> {
    const dir = this.getUserBucketDir(userId, bucket)
    await fs.mkdir(dir, { recursive: true })

    const storedName = `${Date.now()}-${filename}`
    const filePath = path.join(dir, storedName)
    await fs.writeFile(filePath, data)

    return {
      path: `${bucket}/${storedName}`,
      name: storedName,
    }
  }

  /** Verify resolved path stays within the base storage directory (prevents symlink escape) */
  private async assertWithinBase(filePath: string): Promise<void> {
    const real = await fs.realpath(filePath)
    if (!real.startsWith(this.basePath)) {
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
