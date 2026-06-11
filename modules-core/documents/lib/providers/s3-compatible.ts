// Shared base class for S3-compatible storage providers (AWS S3, Cloudflare R2).
// Both providers use the AWS SDK with the same operations and differ only in
// the S3Client configuration (region/endpoint/credentials) and the label used
// for error redaction.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageProviderInterface } from '../../types'
import { withProviderRedaction } from './errors'

export type S3CompatibleProviderLabel = 's3' | 'r2' | 'supabase'

export class S3CompatibleProvider implements StorageProviderInterface {
  constructor(
    protected readonly client: S3Client,
    protected readonly bucketName: string,
    protected readonly label: S3CompatibleProviderLabel
  ) {}

  async upload(
    userId: string,
    filename: string,
    content: Buffer | Blob,
    contentType: string
  ): Promise<{ path: string; size: number }> {
    const path = `${userId}/${filename}`
    const body = Buffer.isBuffer(content) ? content : Buffer.from(await content.arrayBuffer())
    const size = body.length

    await withProviderRedaction(this.label, 'upload', () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: path,
          Body: body,
          ContentType: contentType,
        })
      )
    )

    return { path, size }
  }

  async download(path: string): Promise<Buffer> {
    return withProviderRedaction(this.label, 'download', async () => {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: path,
        })
      )

      if (!response.Body) {
        throw new Error('empty body')
      }

      const bytes = await response.Body.transformToByteArray()
      return Buffer.from(bytes)
    })
  }

  async getSignedUrl(
    path: string,
    expiresInSeconds: number = 300,
    opts?: { filename?: string }
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
      ResponseContentDisposition: opts?.filename
        ? `attachment; filename="${encodeURIComponent(opts.filename)}"`
        : 'attachment',
    })

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds })
  }

  async delete(path: string): Promise<void> {
    await withProviderRedaction(this.label, 'delete', () =>
      this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: path,
        })
      )
    )
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: path,
        })
      )
      return true
    } catch {
      return false
    }
  }
}
