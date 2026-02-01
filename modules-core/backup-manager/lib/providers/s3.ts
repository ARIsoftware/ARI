// AWS S3 Storage Provider

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
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
