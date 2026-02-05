// AWS S3 Storage Provider

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import type { StorageProviderInterface } from '../../types'
import { withRetry } from './retry'
import { logger } from '@/lib/logger'

// Operation timeouts (in milliseconds)
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

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
      // Add request timeout configuration
      requestHandler: {
        requestTimeout: REQUEST_TIMEOUT_MS,
        httpsAgent: { timeout: REQUEST_TIMEOUT_MS },
      } as any,
    })
    this.bucketName = bucketName
  }

  async upload(filename: string, content: string): Promise<{ path: string; size: number }> {
    return withRetry(
      async () => {
        const path = `backups/${filename}`
        const size = Buffer.byteLength(content, 'utf8')

        logger.info(`[S3 Storage] Uploading ${path} (${size} bytes)`)

        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: path,
            Body: content,
            ContentType: 'application/sql',
          })
        )

        logger.info(`[S3 Storage] Upload complete: ${path}`)
        return { path, size }
      },
      { operationName: 'S3 upload', maxAttempts: 3 }
    )
  }

  async download(path: string): Promise<string> {
    return withRetry(
      async () => {
        logger.info(`[S3 Storage] Downloading ${path}`)

        const response = await this.client.send(
          new GetObjectCommand({
            Bucket: this.bucketName,
            Key: path,
          })
        )

        if (!response.Body) {
          throw new Error('Empty response body')
        }

        const content = await response.Body.transformToString()
        logger.info(`[S3 Storage] Download complete: ${path} (${content.length} bytes)`)
        return content
      },
      { operationName: 'S3 download', maxAttempts: 3 }
    )
  }

  async delete(path: string): Promise<void> {
    return withRetry(
      async () => {
        logger.info(`[S3 Storage] Deleting ${path}`)

        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: path,
          })
        )

        logger.info(`[S3 Storage] Delete complete: ${path}`)
      },
      { operationName: 'S3 delete', maxAttempts: 3 }
    )
  }

  async list(): Promise<{ path: string; size: number; createdAt: Date }[]> {
    return withRetry(
      async () => {
        logger.info(`[S3 Storage] Listing backups in ${this.bucketName}`)

        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: 'backups/',
          })
        )

        const results = (response.Contents || []).map((obj) => ({
          path: obj.Key || '',
          size: obj.Size || 0,
          createdAt: obj.LastModified || new Date(),
        }))

        logger.info(`[S3 Storage] Found ${results.length} backups`)
        return results
      },
      { operationName: 'S3 list', maxAttempts: 3 }
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
    } catch (error: any) {
      // NotFound is expected when file doesn't exist
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false
      }
      logger.warn(`[S3 Storage] Exists check failed: ${error.message}`)
      return false
    }
  }
}
