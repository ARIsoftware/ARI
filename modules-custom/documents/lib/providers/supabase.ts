// Supabase Storage Provider for Documents

import { createClient } from '@supabase/supabase-js'
import type { StorageProviderInterface } from '../../types'

export class SupabaseStorageProvider implements StorageProviderInterface {
  private client: ReturnType<typeof createClient>
  private bucketName: string

  constructor(bucketName: string = 'ari-documents') {
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
    const { data: buckets } = await this.client.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === this.bucketName)

    if (!bucketExists) {
      const { error } = await this.client.storage.createBucket(this.bucketName, {
        public: false, // IMPORTANT: Keep bucket private for security
        fileSizeLimit: 524288000, // 500MB default max
      })

      if (error && !error.message.includes('already exists')) {
        throw new Error(`Failed to create bucket: ${error.message}`)
      }
    }
  }

  async upload(
    userId: string,
    filename: string,
    content: Buffer | Blob,
    contentType: string
  ): Promise<{ path: string; size: number }> {
    await this.ensureBucketExists()

    // Organize by user ID for security and organization
    const path = `${userId}/${filename}`
    const size = content instanceof Buffer ? content.length : content.size

    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(path, content, {
        contentType,
        upsert: false, // Don't overwrite existing files
      })

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`)
    }

    return { path, size }
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(path)

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`)
    }

    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async getSignedUrl(path: string, expiresInSeconds: number = 300): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUrl(path, expiresInSeconds)

    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`)
    }

    return data.signedUrl
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove([path])

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`)
    }
  }

  async exists(path: string): Promise<boolean> {
    // Extract the folder path and filename
    const lastSlash = path.lastIndexOf('/')
    const folder = lastSlash > 0 ? path.substring(0, lastSlash) : ''
    const filename = lastSlash > 0 ? path.substring(lastSlash + 1) : path

    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .list(folder, { search: filename })

    if (error) {
      return false
    }

    return (data || []).some((file) => `${folder}/${file.name}` === path || file.name === filename)
  }
}
