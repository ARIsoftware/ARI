// Cloudflare R2 Storage Provider

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { StorageProviderInterface } from '../../types'

export class R2StorageProvider implements StorageProviderInterface {
  private client: S3Client
  private bucketName: string

  constructor(bucketName: string) {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
    this.bucketName = bucketName
  }

  async upload(filename: string, content: string): Promise<{ path: string; size: number }> {
    const path = `backups/${filename}`
    const size = Buffer.byteLength(content, 'utf8')

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: path,
        Body: content,
        ContentType: 'application/sql',
      })
    )

    return { path, size }
  }

  async download(path: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      })
    )

    if (!response.Body) {
      throw new Error('Empty response body')
    }

    return await response.Body.transformToString()
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      })
    )
  }

  async list(): Promise<{ path: string; size: number; createdAt: Date }[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'backups/',
      })
    )

    return (response.Contents || []).map((obj) => ({
      path: obj.Key || '',
      size: obj.Size || 0,
      createdAt: obj.LastModified || new Date(),
    }))
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
