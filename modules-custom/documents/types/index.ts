// Documents Module Types

export type StorageProvider = 'supabase' | 'r2' | 's3'

export type ViewMode = 'cards' | 'table'

// Database model types
export interface Document {
  id: string
  user_id: string
  name: string
  original_name: string
  storage_provider: StorageProvider
  storage_path: string
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
export interface DocumentsSettings {
  onboardingCompleted: boolean
  storageProvider: StorageProvider
  defaultView: ViewMode
  maxFileSizeMb: number
  allowedFileTypes: string[] // Empty array = all types allowed

  // Provider-specific settings
  supabase?: {
    bucketName: string
  }
  r2?: {
    bucketName: string
  }
  s3?: {
    bucketName: string
    region: string
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
  getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

// Constants
export const DEFAULT_DOCUMENTS_SETTINGS: DocumentsSettings = {
  onboardingCompleted: false,
  storageProvider: 'supabase',
  defaultView: 'cards',
  maxFileSizeMb: 500,
  allowedFileTypes: [], // Empty = all types allowed
  supabase: {
    bucketName: 'ari-documents',
  },
}

export const MAX_FILE_SIZE_OPTIONS = [
  { value: 10, label: '10 MB' },
  { value: 25, label: '25 MB' },
  { value: 50, label: '50 MB (Supabase free tier limit)' },
  { value: 100, label: '100 MB' },
  { value: 250, label: '250 MB' },
  { value: 500, label: '500 MB' },
  { value: 1024, label: '1 GB' },
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
