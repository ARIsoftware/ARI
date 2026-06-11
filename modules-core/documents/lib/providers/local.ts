// Local Filesystem Storage Provider for Documents
//
// Active when ARI_STORAGE_PROVIDER=filesystem (or unset). Delegates upload /
// serve / delete to ARI's central /lib/storage so files land in the same
// data/storage/{user_id}/{bucket}/ layout used by every other ARI module.
//
// `getSignedUrl()` returns an authenticated /api/storage/serve URL rather
// than a real signed URL — filesystem files are streamed by ARI's serve
// route with cookie auth instead.

import { getStorageProvider as getAriStorage } from '@/lib/storage'
import type { StorageProvider as AriStorageProvider } from '@/lib/storage'
import type { StorageProviderInterface } from '../../types'

export const LOCAL_BUCKET = 'documents'

export class LocalFilesystemProvider implements StorageProviderInterface {
  private readonly ari: AriStorageProvider
  private readonly bucket: string

  constructor(bucketOverride?: string) {
    // Always pin to ARI's filesystem backend regardless of the current
    // ARI_STORAGE_PROVIDER. Required so an old document row whose
    // storage_provider='local' still resolves to disk after the user has
    // switched the global provider to S3/R2/supabase-s3.
    this.ari = getAriStorage('filesystem')
    this.bucket = bucketOverride || LOCAL_BUCKET
  }

  // Path format matches the S3-compatible providers: `${userId}/${filename}`.
  // We split it back out here so ARI central can take userId + filename
  // separately (its serve/delete APIs derive on-disk paths internally).
  private parsePath(path: string): { userId: string; filename: string } {
    const slashIdx = path.indexOf('/')
    if (slashIdx <= 0) {
      throw new Error('local_invalid_path')
    }
    return {
      userId: path.substring(0, slashIdx),
      filename: path.substring(slashIdx + 1),
    }
  }

  async upload(
    userId: string,
    filename: string,
    content: Buffer | Blob,
    contentType: string
  ): Promise<{ path: string; size: number }> {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(await content.arrayBuffer())
    const result = await this.ari.upload(userId, this.bucket, filename, body, contentType)
    return { path: `${userId}/${result.name}`, size: body.length }
  }

  async download(path: string): Promise<Buffer> {
    const { userId, filename } = this.parsePath(path)
    const result = await this.ari.serve(userId, this.bucket, filename)
    if (!result) throw new Error('local_download_failed')
    const chunks: Buffer[] = []
    const reader = result.stream.getReader()
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  }

  async getSignedUrl(
    path: string,
    _expiresInSeconds?: number,
    _opts?: { filename?: string }
  ): Promise<string> {
    const { filename } = this.parsePath(path)
    return `/api/storage/serve/${this.bucket}/${filename}`
  }

  async delete(path: string): Promise<void> {
    const { userId, filename } = this.parsePath(path)
    await this.ari.delete(userId, this.bucket, filename)
  }

  async exists(path: string): Promise<boolean> {
    const { userId, filename } = this.parsePath(path)
    const result = await this.ari.serve(userId, this.bucket, filename)
    if (!result) return false
    await result.stream.cancel().catch(() => {})
    return true
  }
}
