// Cloudflare R2 Storage Provider

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

        logger.info(`[R2 Storage] Uploading ${path} (${size} bytes)`)

        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: path,
            Body: content,
            ContentType: 'application/sql',
          })
        )

        logger.info(`[R2 Storage] Upload complete: ${path}`)
        return { path, size }
      },
      { operationName: 'R2 upload', maxAttempts: 3 }
    )
  }

  async download(path: string): Promise<string> {
    return withRetry(
      async () => {
        logger.info(`[R2 Storage] Downloading ${path}`)

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
        logger.info(`[R2 Storage] Download complete: ${path} (${content.length} bytes)`)
        return content
      },
      { operationName: 'R2 download', maxAttempts: 3 }
    )
  }

  async delete(path: string): Promise<void> {
    return withRetry(
      async () => {
        logger.info(`[R2 Storage] Deleting ${path}`)

        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: path,
          })
        )

        logger.info(`[R2 Storage] Delete complete: ${path}`)
      },
      { operationName: 'R2 delete', maxAttempts: 3 }
    )
  }

  async list(): Promise<{ path: string; size: number; createdAt: Date }[]> {
    return withRetry(
      async () => {
        logger.info(`[R2 Storage] Listing backups in ${this.bucketName}`)

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

        logger.info(`[R2 Storage] Found ${results.length} backups`)
        return results
      },
      { operationName: 'R2 list', maxAttempts: 3 }
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
      logger.warn(`[R2 Storage] Exists check failed: ${error.message}`)
      return false
    }
  }
}
