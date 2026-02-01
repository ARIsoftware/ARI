// Cloudflare R2 Storage Provider for Documents

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageProviderInterface } from '../../types'

export class R2StorageProvider implements StorageProviderInterface {
  private client: S3Client
  private bucketName: string

  constructor(bucketName: string) {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'Missing R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)'
      )
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

  async upload(
    userId: string,
    filename: string,
    content: Buffer | Blob,
    contentType: string
  ): Promise<{ path: string; size: number }> {
    const path = `${userId}/${filename}`
    const body = content instanceof Buffer ? content : Buffer.from(await content.arrayBuffer())
    const size = body.length

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: path,
        Body: body,
        ContentType: contentType,
      })
    )

    return { path, size }
  }

  async download(path: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      })
    )

    if (!response.Body) {
      throw new Error('Empty response body')
    }

    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  }

  async getSignedUrl(path: string, expiresInSeconds: number = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    })

    return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds })
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      })
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
