// Documents Module Types

export type StorageProvider = 'supabase' | 'r2' | 's3' | 'local'

export type ViewMode = 'cards' | 'table'

// Database model types
export interface Document {
  id: string
  user_id: string
  name: string
  original_name: string
  storage_provider: StorageProvider
  storage_path: string
  // Bucket the file was uploaded to. Recorded at upload time so provider /
  // bucket changes don't break old files. Null only for rows from before
  // this column existed, in which case the read path falls back to env.
  storage_bucket: string | null
  size_bytes: number
  mime_type: string
  folder_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DocumentFolder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DocumentTag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface DocumentTagAssignment {
  id: string
  document_id: string
  tag_id: string
  created_at: string
}

// Extended types with relationships
export interface DocumentWithTags extends Document {
  tags: DocumentTag[]
  // Signed URL for inline preview, attached by the list endpoint for image
  // MIME types only. Expires after a few minutes; the list query refetches
  // naturally on cache invalidation.
  preview_url?: string
}

export interface FolderWithChildren extends DocumentFolder {
  children: FolderWithChildren[]
  document_count?: number
}

// API request/response types
export interface CreateDocumentRequest {
  name?: string
  folder_id?: string | null
  tag_ids?: string[]
}

export interface UpdateDocumentRequest {
  name?: string
  folder_id?: string | null
  tag_ids?: string[]
}

export interface CreateFolderRequest {
  name: string
  parent_id?: string | null
}

export interface UpdateFolderRequest {
  name?: string
  parent_id?: string | null
}

export interface CreateTagRequest {
  name: string
  color: string
}

export interface UpdateTagRequest {
  name?: string
  color?: string
}

// Settings types
//
// Storage provider is NOT stored here — it's resolved globally from
// ARI_STORAGE_PROVIDER in .env.local. Per-row `Document.storage_provider`
// preserves what each existing file was uploaded with so reads still work
// after a global switch.
export interface DocumentsSettings {
  onboardingCompleted: boolean
  defaultView: ViewMode
  maxFileSizeMb: number
  allowedFileTypes: string[] // Empty array = all types allowed
}

// Shape returned by GET /api/modules/documents/settings. `globalProvider` is
// the active provider read from ARI_STORAGE_PROVIDER, included for the
// settings UI banner.
export interface DocumentsSettingsResponse extends DocumentsSettings {
  globalProvider: {
    provider: StorageProvider
    label: string
    source: 'env' | 'default'
  }
}

// Filter and search types
export interface DocumentFilters {
  search?: string
  folder_id?: string | null
  tag_ids?: string[]
  mime_types?: string[]
  date_from?: string
  date_to?: string
  size_min?: number
  size_max?: number
}

export interface DocumentSortOptions {
  field: 'name' | 'created_at' | 'updated_at' | 'size_bytes'
  direction: 'asc' | 'desc'
}

// Bulk operation types
export interface BulkOperationRequest {
  document_ids: string[]
}

export interface BulkMoveRequest extends BulkOperationRequest {
  folder_id: string | null
}

export interface BulkTagRequest extends BulkOperationRequest {
  tag_ids: string[]
}

// Upload types
export interface UploadResult {
  success: boolean
  document?: Document
  error?: string
}

export interface DownloadUrlResult {
  url: string
  expires_at: string
}

// Storage provider interface
export interface StorageProviderInterface {
  upload(
    userId: string,
    filename: string,
    content: Buffer | Blob,
    contentType: string
  ): Promise<{ path: string; size: number }>
  download(path: string): Promise<Buffer>
  getSignedUrl(
    path: string,
    expiresInSeconds?: number,
    opts?: { filename?: string }
  ): Promise<string>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

// Constants
export const MODULE_ID = 'documents' as const

// Single source of truth for which env vars each provider requires. Used by
// the provider constructors and the configuration check so the lists can't
// drift out of sync.
export const REQUIRED_ENV_VARS = {
  r2: ['ARI_R2_ACCOUNT_ID', 'ARI_R2_ACCESS_KEY_ID', 'ARI_R2_SECRET_ACCESS_KEY', 'ARI_R2_BUCKET'],
  s3: ['ARI_S3_ACCESS_KEY_ID', 'ARI_S3_SECRET_ACCESS_KEY', 'ARI_S3_BUCKET'],
  supabase: [
    'ARI_SUPABASE_S3_ENDPOINT',
    'ARI_SUPABASE_S3_ACCESS_KEY_ID',
    'ARI_SUPABASE_S3_SECRET_ACCESS_KEY',
    'ARI_SUPABASE_S3_BUCKET',
  ],
  local: [],
} as const satisfies Record<StorageProvider, readonly string[]>

// Max single-shot upload size. Uploads are buffered in memory; this cap keeps
// self-hosted ARI memory-safe and is informational on Vercel (the platform's
// own ~4.5 MB body limit takes effect first).
export const MAX_UPLOAD_MB = 50

// MIME types we reject when no explicit allowlist is configured because they
// can carry executable script content even after Content-Disposition: attachment.
export const RISKY_MIME_TYPES: readonly string[] = [
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
] as const

export const DEFAULT_DOCUMENTS_SETTINGS: DocumentsSettings = {
  onboardingCompleted: false,
  defaultView: 'cards',
  maxFileSizeMb: MAX_UPLOAD_MB,
  allowedFileTypes: [], // Empty = all types allowed
}

export const MAX_FILE_SIZE_OPTIONS = [
  { value: 10, label: '10 MB' },
  { value: 25, label: '25 MB' },
  { value: 50, label: '50 MB' },
] as const

export const TAG_COLORS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#6b7280', label: 'Gray' },
] as const

// File type categories for filtering
export const FILE_TYPE_CATEGORIES = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ],
  spreadsheets: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ],
  videos: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  archives: [
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
  ],
  code: [
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'application/json',
    'text/html',
    'text/css',
    'text/x-python',
  ],
} as const

// Trash retention in days
export const TRASH_RETENTION_DAYS = 5
