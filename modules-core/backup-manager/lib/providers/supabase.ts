// Supabase Storage Provider

import { createClient } from '@supabase/supabase-js'
import type { StorageProviderInterface } from '../../types'

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
    // Check if bucket exists
    const { data: buckets } = await this.client.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === this.bucketName)

    if (!bucketExists) {
      // Create the bucket
      const { error } = await this.client.storage.createBucket(this.bucketName, {
        public: false,
        fileSizeLimit: 52428800, // 50MB
      })

      if (error && !error.message.includes('already exists')) {
        throw new Error(`Failed to create bucket: ${error.message}`)
      }
    }
  }

  async upload(filename: string, content: string): Promise<{ path: string; size: number }> {
    await this.ensureBucketExists()

    const path = `backups/${filename}`
    const blob = new Blob([content], { type: 'application/sql' })
    const size = blob.size

    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(path, blob, {
        contentType: 'application/sql',
        upsert: true,
      })

    if (error) {
      throw new Error(`Failed to upload backup: ${error.message}`)
    }

    return { path, size }
  }

  async download(path: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(path)

    if (error) {
      throw new Error(`Failed to download backup: ${error.message}`)
    }

    return await data.text()
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove([path])

    if (error) {
      throw new Error(`Failed to delete backup: ${error.message}`)
    }
  }

  async list(): Promise<{ path: string; size: number; createdAt: Date }[]> {
    await this.ensureBucketExists()

    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .list('backups', {
        sortBy: { column: 'created_at', order: 'desc' },
      })

    if (error) {
      throw new Error(`Failed to list backups: ${error.message}`)
    }

    return (data || []).map((file) => ({
      path: `backups/${file.name}`,
      size: file.metadata?.size || 0,
      createdAt: new Date(file.created_at),
    }))
  }

  async exists(path: string): Promise<boolean> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .list('backups', { search: path.replace('backups/', '') })

    if (error) {
      return false
    }

    return (data || []).length > 0
  }
}
