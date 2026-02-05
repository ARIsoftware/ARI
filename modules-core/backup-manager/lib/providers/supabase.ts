// Supabase Storage Provider

import { createClient } from '@supabase/supabase-js'
import type { StorageProviderInterface } from '../../types'
import { withRetry, withTimeout } from './retry'
import { logger } from '@/lib/logger'

// Operation timeouts
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes for uploads
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes for downloads
const OPERATION_TIMEOUT_MS = 30 * 1000 // 30 seconds for other operations

// Mutex to prevent concurrent bucket creation
let bucketCreationPromise: Promise<void> | null = null

export class SupabaseStorageProvider implements StorageProviderInterface {
  private client: ReturnType<typeof createClient>
  private bucketName: string

  constructor(bucketName: string = 'ari-backups') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error('Missing Supabase environment variables')
    }

    this.client = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    this.bucketName = bucketName
  }

  private async ensureBucketExists(): Promise<void> {
    // Use mutex to prevent race condition on concurrent bucket creation
    if (bucketCreationPromise) {
      await bucketCreationPromise
      return
    }

    bucketCreationPromise = this.doEnsureBucketExists()
    try {
      await bucketCreationPromise
    } finally {
      bucketCreationPromise = null
    }
  }

  private async doEnsureBucketExists(): Promise<void> {
    try {
      // Check if bucket exists
      const { data: buckets, error: listError } = await withTimeout(
        this.client.storage.listBuckets(),
        OPERATION_TIMEOUT_MS,
        'Bucket list timed out'
      )

      if (listError) {
        logger.warn(`[Supabase Storage] Failed to list buckets: ${listError.message}`)
        // Continue anyway - bucket might already exist
      }

      const bucketExists = buckets?.some((b) => b.name === this.bucketName)

      if (!bucketExists) {
        logger.info(`[Supabase Storage] Creating bucket: ${this.bucketName}`)

        const { error } = await withTimeout(
          this.client.storage.createBucket(this.bucketName, {
            public: false,
            fileSizeLimit: 52428800, // 50MB
          }),
          OPERATION_TIMEOUT_MS,
          'Bucket creation timed out'
        )

        if (error && !error.message.includes('already exists')) {
          throw new Error(`Failed to create bucket: ${error.message}`)
        }

        logger.info(`[Supabase Storage] Bucket created: ${this.bucketName}`)
      }
    } catch (error: any) {
      // If error is "already exists", that's fine
      if (error.message?.includes('already exists')) {
        return
      }
      throw error
    }
  }

  async upload(filename: string, content: string): Promise<{ path: string; size: number }> {
    return withRetry(
      async () => {
        await this.ensureBucketExists()

        const path = `backups/${filename}`
        const blob = new Blob([content], { type: 'application/sql' })
        const size = blob.size

        logger.info(`[Supabase Storage] Uploading ${path} (${size} bytes)`)

        const { error } = await withTimeout(
          this.client.storage
            .from(this.bucketName)
            .upload(path, blob, {
              contentType: 'application/sql',
              upsert: true,
            }),
          UPLOAD_TIMEOUT_MS,
          `Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s`
        )

        if (error) {
          throw new Error(`Failed to upload backup: ${error.message}`)
        }

        logger.info(`[Supabase Storage] Upload complete: ${path}`)
        return { path, size }
      },
      { operationName: 'Supabase upload', maxAttempts: 3 }
    )
  }

  async download(path: string): Promise<string> {
    return withRetry(
      async () => {
        logger.info(`[Supabase Storage] Downloading ${path}`)

        const { data, error } = await withTimeout(
          this.client.storage
            .from(this.bucketName)
            .download(path),
          DOWNLOAD_TIMEOUT_MS,
          `Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`
        )

        if (error) {
          throw new Error(`Failed to download backup: ${error.message}`)
        }

        const content = await data.text()
        logger.info(`[Supabase Storage] Download complete: ${path} (${content.length} bytes)`)
        return content
      },
      { operationName: 'Supabase download', maxAttempts: 3 }
    )
  }

  async delete(path: string): Promise<void> {
    return withRetry(
      async () => {
        logger.info(`[Supabase Storage] Deleting ${path}`)

        const { error } = await withTimeout(
          this.client.storage
            .from(this.bucketName)
            .remove([path]),
          OPERATION_TIMEOUT_MS,
          'Delete timed out'
        )

        if (error) {
          throw new Error(`Failed to delete backup: ${error.message}`)
        }

        logger.info(`[Supabase Storage] Delete complete: ${path}`)
      },
      { operationName: 'Supabase delete', maxAttempts: 3 }
    )
  }

  async list(): Promise<{ path: string; size: number; createdAt: Date }[]> {
    return withRetry(
      async () => {
        await this.ensureBucketExists()

        logger.info(`[Supabase Storage] Listing backups in ${this.bucketName}`)

        const { data, error } = await withTimeout(
          this.client.storage
            .from(this.bucketName)
            .list('backups', {
              sortBy: { column: 'created_at', order: 'desc' },
            }),
          OPERATION_TIMEOUT_MS,
          'List timed out'
        )

        if (error) {
          throw new Error(`Failed to list backups: ${error.message}`)
        }

        const results = (data || []).map((file) => ({
          path: `backups/${file.name}`,
          size: file.metadata?.size || 0,
          createdAt: new Date(file.created_at),
        }))

        logger.info(`[Supabase Storage] Found ${results.length} backups`)
        return results
      },
      { operationName: 'Supabase list', maxAttempts: 3 }
    )
  }

  async exists(path: string): Promise<boolean> {
    try {
      const { data, error } = await withTimeout(
        this.client.storage
          .from(this.bucketName)
          .list('backups', { search: path.replace('backups/', '') }),
        OPERATION_TIMEOUT_MS,
        'Exists check timed out'
      )

      if (error) {
        logger.warn(`[Supabase Storage] Exists check failed: ${error.message}`)
        return false
      }

      return (data || []).length > 0
    } catch {
      return false
    }
  }
}
