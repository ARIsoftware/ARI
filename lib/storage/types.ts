export interface StorageFile {
  name: string           // filename as stored (e.g., "1714300000000-photo.jpg")
  bucket: string
  size: number
  contentType: string
  createdAt: string      // ISO timestamp
  path: string           // relative: "bucket/filename"
}

export interface UploadResult {
  path: string           // "bucket/timestamp-filename"
  name: string           // stored filename
}

export interface ServeResult {
  stream: ReadableStream
  contentType: string
  size: number
}

export interface StorageProvider {
  upload(userId: string, bucket: string, filename: string, data: Buffer, contentType: string): Promise<UploadResult>
  serve(userId: string, bucket: string, filename: string): Promise<ServeResult | null>
  delete(userId: string, bucket: string, filename: string): Promise<void>
  list(userId: string, bucket: string): Promise<StorageFile[]>
}

export interface BucketConfig {
  maxFileSize: number          // bytes
  allowedMimeTypes: string[]   // empty = allow all
}

export const DEFAULT_BUCKET_CONFIG: BucketConfig = {
  maxFileSize: 10 * 1024 * 1024,  // 10MB
  allowedMimeTypes: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon',
    'application/pdf',
    'text/plain', 'text/csv', 'application/json',
    'audio/mpeg', 'video/mp4',
    'application/zip',
    'font/woff', 'font/woff2',
  ],
}
