import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import type { StorageProvider, StorageFile, UploadResult, ServeResult } from './types'
import { getMimeTypeForExtension } from './local'

export interface S3ProviderConfig {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region?: string
  endpoint?: string
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client
  private bucket: string

  constructor(config: S3ProviderConfig) {
    this.bucket = config.bucket
    this.client = new S3Client({
      region: config.region || 'us-east-1',
      endpoint: config.endpoint || undefined,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Required for S3-compatible services (R2, Supabase, MinIO)
      forcePathStyle: !!config.endpoint,
    })
  }

  private getKey(userId: string, bucket: string, filename: string): string {
    return `${userId}/${bucket}/${filename}`
  }

  async upload(
    userId: string,
    bucket: string,
    filename: string,
    data: Buffer,
    contentType: string
  ): Promise<UploadResult> {
    const storedName = `${Date.now()}-${filename}`
    const key = this.getKey(userId, bucket, storedName)

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    }))

    return {
      path: `${bucket}/${storedName}`,
      name: storedName,
    }
  }

  async serve(
    userId: string,
    bucket: string,
    filename: string
  ): Promise<ServeResult | null> {
    const key = this.getKey(userId, bucket, filename)

    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }))

      if (!response.Body) return null

      return {
        stream: response.Body.transformToWebStream(),
        // Derive content-type from extension (not S3 metadata) to prevent attacker-controlled MIME types
        contentType: getMimeTypeForExtension(filename),
        size: response.ContentLength || 0,
      }
    } catch (err: unknown) {
      const code = (err as { name?: string })?.name
      if (code === 'NoSuchKey' || code === 'NotFound') return null
      throw err
    }
  }

  async delete(userId: string, bucket: string, filename: string): Promise<void> {
    const key = this.getKey(userId, bucket, filename)

    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }))
    // S3 DeleteObject doesn't error on missing keys — it's already a no-op
  }

  async list(userId: string, bucket: string): Promise<StorageFile[]> {
    const prefix = `${userId}/${bucket}/`
    const files: StorageFile[] = []
    let continuationToken: string | undefined

    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }))

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (!obj.Key || obj.Key === prefix) continue
          const name = obj.Key.slice(prefix.length)
          files.push({
            name,
            bucket,
            size: obj.Size || 0,
            contentType: 'application/octet-stream',
            createdAt: (obj.LastModified || new Date()).toISOString(),
            path: `${bucket}/${name}`,
          })
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return files
  }
}
