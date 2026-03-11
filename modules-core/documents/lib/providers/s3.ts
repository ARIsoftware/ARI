// AWS S3 Storage Provider for Documents

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageProviderInterface } from '../../types'

export class S3StorageProvider implements StorageProviderInterface {
  private client: S3Client
  private bucketName: string

  constructor(bucketName: string, region: string) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing AWS environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)')
    }

    this.client = new S3Client({
      region: region || process.env.AWS_REGION || 'us-east-1',
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
