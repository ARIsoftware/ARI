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
  allowedMimeTypes: string[]   // empty = allow all (subject to blockedExtensions)
  blockedExtensions: string[]  // extensions that are always rejected
}

/** Executable/script extensions that should never be uploaded */
export const BLOCKED_EXTENSIONS = [
  '.exe', '.msi', '.dll', '.com', '.cmd', '.bat',
  '.sh', '.bash', '.zsh', '.csh', '.ksh', '.fish',
  '.ps1', '.psm1', '.psd1',
  '.app', '.dmg', '.pkg',
  '.deb', '.rpm', '.apk',
  '.bin', '.run', '.elf',
  '.vbs', '.vbe', '.wsf', '.wsh', '.scr', '.pif',
  '.jar', '.class',
  '.py', '.pyc', '.pyo',
  '.rb', '.pl', '.php',
  '.html', '.htm', '.xhtml', '.svg',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.css', '.scss', '.less',
]

export const DEFAULT_BUCKET_CONFIG: BucketConfig = {
  maxFileSize: 25 * 1024 * 1024,  // 25MB
  allowedMimeTypes: [],            // allow all (not restricted by MIME)
  blockedExtensions: BLOCKED_EXTENSIONS,
}
