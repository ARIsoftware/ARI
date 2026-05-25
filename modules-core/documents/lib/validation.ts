import { z } from 'zod'
import '@/lib/openapi/registry'
import { FOLDER_NAME_PATTERN, FOLDER_NAME_MAX_LENGTH } from './utils'
import { MAX_UPLOAD_MB } from '../types'

const uuidSchema = z.string().uuid('Invalid ID format')

// ────────────────────────────────────────────────────────────
// Shared row schemas
// ────────────────────────────────────────────────────────────

export const DocumentTagSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  color: z.string(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
}).openapi('DocumentTag')

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  original_name: z.string(),
  storage_provider: z.string(),
  storage_path: z.string(),
  storage_bucket: z.string().nullable(),
  size_bytes: z.number().int().nonnegative(),
  mime_type: z.string(),
  folder_id: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
}).openapi('Document')

export const DocumentWithTagsSchema = DocumentSchema.extend({
  tags: z.array(DocumentTagSchema),
  preview_url: z.string().optional(),
}).openapi('DocumentWithTags')

// Recursive shape: `children` is an array of the same DocumentFolder objects.
// Expressed as `unknown[]` in the OpenAPI schema to avoid recursive Zod cycles
// that the generator can't serialize.
export const DocumentFolderSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  parent_id: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  document_count: z.number().int().nonnegative(),
  children: z.array(z.unknown()).optional(),
}).openapi('DocumentFolder')

// ────────────────────────────────────────────────────────────
// /files
// ────────────────────────────────────────────────────────────

export const listFilesQuerySchema = z.object({
  folder_id: z.string().optional(),
  search: z.string().optional(),
  mime_types: z.string().optional(),
  tag_ids: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  include_deleted: z.enum(['true', 'false']).optional(),
  deleted_only: z.enum(['true', 'false']).optional(),
  with_previews: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const FileListResponseSchema = z.object({
  files: z.array(DocumentWithTagsSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
}).openapi('DocumentFileListResponse')

export const UploadFileFormSchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
  folder_id: z.string().uuid().optional(),
  tag_ids: z.string().optional(),
}).openapi('DocumentUploadForm')

export const DocumentSingleResponseSchema = z.object({
  document: DocumentSchema,
}).openapi('DocumentSingleResponse')

export const BulkFilesBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('delete'),
    ids: z.array(uuidSchema).min(1).max(500),
  }),
  z.object({
    action: z.literal('move'),
    ids: z.array(uuidSchema).min(1).max(500),
    folder_id: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal('tag'),
    ids: z.array(uuidSchema).min(1).max(500),
    tag_ids: z.array(uuidSchema).max(100),
  }),
]).openapi('DocumentBulkBody')

export const BulkFilesResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
}).openapi('DocumentBulkResponse')

export const updateDocumentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folder_id: z.string().uuid().nullable().optional(),
  tag_ids: z.array(uuidSchema).optional(),
}).openapi('UpdateDocumentBody')

export const idParamSchema = z.object({
  id: uuidSchema,
})

export const DocumentSoftDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('DocumentSoftDeleteResponse')

export const DownloadResponseSchema = z.object({
  url: z.string(),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  expires_at: z.string(),
}).openapi('DocumentDownloadResponse')

export const RestoreDocumentResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  document: DocumentSchema,
}).openapi('DocumentRestoreResponse')

// ────────────────────────────────────────────────────────────
// /folders
// ────────────────────────────────────────────────────────────

export const listFoldersQuerySchema = z.object({
  flat: z.enum(['true', 'false']).optional(),
  include_deleted: z.enum(['true', 'false']).optional(),
})

export const FolderListResponseSchema = z.object({
  folders: z.array(DocumentFolderSchema),
  count: z.number().int().nonnegative(),
}).openapi('DocumentFolderListResponse')

export const createFolderSchema = z.object({
  name: z.string().min(1).max(FOLDER_NAME_MAX_LENGTH).regex(FOLDER_NAME_PATTERN, 'Folder name may only contain letters, numbers, hyphens, and underscores'),
  parent_id: z.string().uuid().nullable().optional(),
}).openapi('CreateFolderBody')

export const FolderSingleResponseSchema = z.object({
  folder: DocumentFolderSchema,
}).openapi('DocumentFolderSingleResponse')

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(FOLDER_NAME_MAX_LENGTH).regex(FOLDER_NAME_PATTERN, 'Folder name may only contain letters, numbers, hyphens, and underscores').optional(),
  parent_id: z.string().uuid().nullable().optional(),
}).openapi('UpdateFolderBody')

export const FolderDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  folders_affected: z.number().int().nonnegative(),
}).openapi('DocumentFolderDeleteResponse')

// ────────────────────────────────────────────────────────────
// /tags
// ────────────────────────────────────────────────────────────

export const DocumentTagWithCountSchema = DocumentTagSchema.extend({
  usage_count: z.number().int().nonnegative(),
}).openapi('DocumentTagWithCount')

export const TagListResponseSchema = z.object({
  tags: z.array(DocumentTagWithCountSchema),
  count: z.number().int().nonnegative(),
}).openapi('DocumentTagListResponse')

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
}).openapi('CreateDocumentTagBody')

export const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
}).openapi('UpdateDocumentTagBody')

export const TagSingleResponseSchema = z.object({
  tag: DocumentTagSchema,
}).openapi('DocumentTagSingleResponse')

export const TagDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('DocumentTagDeleteResponse')

// ────────────────────────────────────────────────────────────
// /settings
// ────────────────────────────────────────────────────────────

export const DocumentSettingsBodySchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  defaultView: z.enum(['cards', 'table']).optional(),
  maxFileSizeMb: z.number().min(1).max(MAX_UPLOAD_MB).optional(),
  allowedFileTypes: z.array(z.string()).optional(),
}).strict().openapi('DocumentSettingsBody')

export const DocumentSettingsResponseSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
  defaultView: z.enum(['cards', 'table']).optional(),
  maxFileSizeMb: z.number().optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  globalProvider: z.object({
    provider: z.string(),
    label: z.string(),
    source: z.enum(['env', 'default']),
  }),
}).passthrough().openapi('DocumentSettingsResponse')

export const DocumentSettingsSaveResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('DocumentSettingsSaveResponse')

// ────────────────────────────────────────────────────────────
// /trash/empty
// ────────────────────────────────────────────────────────────

export const emptyTrashQuerySchema = z.object({
  auto: z.enum(['true', 'false']).optional(),
})

export const EmptyTrashResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  documents_deleted: z.number().int().nonnegative(),
  folders_deleted: z.number().int().nonnegative(),
  storage_errors: z.array(z.string()).optional(),
}).openapi('EmptyTrashResponse')

export const trashDeleteQuerySchema = z.object({
  id: uuidSchema,
  type: z.enum(['document', 'folder']).optional(),
})

export const TrashItemDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).openapi('TrashItemDeleteResponse')
