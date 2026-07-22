import { describe, it, expect } from 'vitest'
import {
  DocumentTagSchema,
  DocumentSchema,
  DocumentWithTagsSchema,
  DocumentFolderSchema,
  listFilesQuerySchema,
  FileListResponseSchema,
  UploadFileFormSchema,
  DocumentSingleResponseSchema,
  BulkFilesBodySchema,
  BulkFilesResponseSchema,
  updateDocumentSchema,
  idParamSchema,
  DocumentSoftDeleteResponseSchema,
  DownloadResponseSchema,
  RestoreDocumentResponseSchema,
  listFoldersQuerySchema,
  FolderListResponseSchema,
  createFolderSchema,
  FolderSingleResponseSchema,
  updateFolderSchema,
  FolderDeleteResponseSchema,
  DocumentTagWithCountSchema,
  TagListResponseSchema,
  createTagSchema,
  updateTagSchema,
  TagSingleResponseSchema,
  TagDeleteResponseSchema,
  DocumentSettingsBodySchema,
  DocumentSettingsResponseSchema,
  DocumentSettingsSaveResponseSchema,
  emptyTrashQuerySchema,
  EmptyTrashResponseSchema,
  trashDeleteQuerySchema,
  TrashItemDeleteResponseSchema,
} from '@/modules-core/documents/lib/validation'
import { MAX_UPLOAD_MB } from '@/modules-core/documents/types'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const VALID_UUID2 = '223e4567-e89b-12d3-a456-426614174001'

// ─── DocumentTagSchema ────────────────────────────────────────────────────────

describe('DocumentTagSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    name: 'Important',
    color: '#ff0000',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
  }

  it('accepts valid tag', () => {
    expect(DocumentTagSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts null updated_at', () => {
    expect(DocumentTagSchema.safeParse({ ...valid, updated_at: null }).success).toBe(true)
  })

  it('accepts string updated_at', () => {
    expect(DocumentTagSchema.safeParse({ ...valid, updated_at: '2024-01-01T00:00:00Z' }).success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    expect(DocumentTagSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false)
  })
})

// ─── DocumentSchema ───────────────────────────────────────────────────────────

describe('DocumentSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    name: 'report.pdf',
    original_name: 'report.pdf',
    storage_provider: 'local',
    storage_path: '/data/storage/user1/docs/report.pdf',
    storage_bucket: null,
    size_bytes: 1024,
    mime_type: 'application/pdf',
    folder_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
  }

  it('accepts valid document', () => {
    expect(DocumentSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects negative size_bytes', () => {
    expect(DocumentSchema.safeParse({ ...valid, size_bytes: -1 }).success).toBe(false)
  })

  it('accepts size_bytes of zero', () => {
    expect(DocumentSchema.safeParse({ ...valid, size_bytes: 0 }).success).toBe(true)
  })

  it('rejects non-integer size_bytes', () => {
    expect(DocumentSchema.safeParse({ ...valid, size_bytes: 1.5 }).success).toBe(false)
  })

  it('accepts valid folder_id UUID', () => {
    expect(DocumentSchema.safeParse({ ...valid, folder_id: VALID_UUID2 }).success).toBe(true)
  })

  it('rejects non-UUID folder_id', () => {
    expect(DocumentSchema.safeParse({ ...valid, folder_id: 'bad' }).success).toBe(false)
  })
})

// ─── DocumentWithTagsSchema ───────────────────────────────────────────────────

describe('DocumentWithTagsSchema', () => {
  const validDoc = {
    id: VALID_UUID,
    user_id: 'user1',
    name: 'file.pdf',
    original_name: 'file.pdf',
    storage_provider: 'local',
    storage_path: '/path',
    storage_bucket: null,
    size_bytes: 0,
    mime_type: 'application/pdf',
    folder_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    tags: [],
  }

  it('accepts document with empty tags', () => {
    expect(DocumentWithTagsSchema.safeParse(validDoc).success).toBe(true)
  })

  it('accepts optional preview_url', () => {
    expect(DocumentWithTagsSchema.safeParse({ ...validDoc, preview_url: 'https://cdn.example.com/preview.png' }).success).toBe(true)
  })
})

// ─── DocumentFolderSchema ─────────────────────────────────────────────────────

describe('DocumentFolderSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'user1',
    name: 'My-Folder',
    parent_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    document_count: 3,
  }

  it('accepts valid folder', () => {
    expect(DocumentFolderSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects negative document_count', () => {
    expect(DocumentFolderSchema.safeParse({ ...valid, document_count: -1 }).success).toBe(false)
  })

  it('accepts optional children array', () => {
    expect(DocumentFolderSchema.safeParse({ ...valid, children: [] }).success).toBe(true)
  })
})

// ─── listFilesQuerySchema ─────────────────────────────────────────────────────

describe('listFilesQuerySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(listFilesQuerySchema.safeParse({}).success).toBe(true)
  })

  it('coerces limit string to number', () => {
    const result = listFilesQuerySchema.parse({ limit: '50' })
    expect(result.limit).toBe(50)
  })

  it('rejects limit less than 1', () => {
    expect(listFilesQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('rejects limit greater than 200', () => {
    expect(listFilesQuerySchema.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('rejects negative offset', () => {
    expect(listFilesQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('accepts include_deleted "true"', () => {
    expect(listFilesQuerySchema.safeParse({ include_deleted: 'true' }).success).toBe(true)
  })

  it('accepts include_deleted "false"', () => {
    expect(listFilesQuerySchema.safeParse({ include_deleted: 'false' }).success).toBe(true)
  })

  it('rejects include_deleted "yes"', () => {
    expect(listFilesQuerySchema.safeParse({ include_deleted: 'yes' }).success).toBe(false)
  })

  it('accepts deleted_only "true"', () => {
    expect(listFilesQuerySchema.safeParse({ deleted_only: 'true' }).success).toBe(true)
  })

  it('accepts with_previews "true"', () => {
    expect(listFilesQuerySchema.safeParse({ with_previews: 'true' }).success).toBe(true)
  })
})

// ─── FileListResponseSchema ───────────────────────────────────────────────────

describe('FileListResponseSchema', () => {
  it('accepts valid response', () => {
    const valid = { files: [], count: 0, limit: 50, offset: 0, has_more: false }
    expect(FileListResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects limit of 0 (must be positive)', () => {
    expect(FileListResponseSchema.safeParse({ files: [], count: 0, limit: 0, offset: 0, has_more: false }).success).toBe(false)
  })
})

// ─── BulkFilesBodySchema ──────────────────────────────────────────────────────

describe('BulkFilesBodySchema', () => {
  it('accepts delete action', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'delete', ids: [VALID_UUID] }).success).toBe(true)
  })

  it('accepts move action with folder_id', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'move', ids: [VALID_UUID], folder_id: VALID_UUID2 }).success).toBe(true)
  })

  it('accepts move action with null folder_id', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'move', ids: [VALID_UUID], folder_id: null }).success).toBe(true)
  })

  it('accepts tag action', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'tag', ids: [VALID_UUID], tag_ids: [VALID_UUID2] }).success).toBe(true)
  })

  it('accepts tag action with empty tag_ids', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'tag', ids: [VALID_UUID], tag_ids: [] }).success).toBe(true)
  })

  it('rejects unknown action', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'archive', ids: [VALID_UUID] }).success).toBe(false)
  })

  it('rejects empty ids for delete', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'delete', ids: [] }).success).toBe(false)
  })

  it('rejects more than 500 ids', () => {
    const ids = Array.from({ length: 501 }, () => VALID_UUID)
    expect(BulkFilesBodySchema.safeParse({ action: 'delete', ids }).success).toBe(false)
  })

  it('rejects non-UUID in ids', () => {
    expect(BulkFilesBodySchema.safeParse({ action: 'delete', ids: ['bad-id'] }).success).toBe(false)
  })

  it('rejects more than 100 tag_ids', () => {
    const tag_ids = Array.from({ length: 101 }, () => VALID_UUID)
    expect(BulkFilesBodySchema.safeParse({ action: 'tag', ids: [VALID_UUID], tag_ids }).success).toBe(false)
  })
})

// ─── BulkFilesResponseSchema ──────────────────────────────────────────────────

describe('BulkFilesResponseSchema', () => {
  it('accepts valid updated count', () => {
    expect(BulkFilesResponseSchema.safeParse({ updated: 5 }).success).toBe(true)
  })

  it('accepts zero updated', () => {
    expect(BulkFilesResponseSchema.safeParse({ updated: 0 }).success).toBe(true)
  })

  it('rejects negative updated', () => {
    expect(BulkFilesResponseSchema.safeParse({ updated: -1 }).success).toBe(false)
  })
})

// ─── updateDocumentSchema ─────────────────────────────────────────────────────

describe('updateDocumentSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(true)
  })

  it('accepts name update', () => {
    expect(updateDocumentSchema.safeParse({ name: 'new-name.pdf' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(updateDocumentSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects name exceeding 255 chars', () => {
    expect(updateDocumentSchema.safeParse({ name: 'a'.repeat(256) }).success).toBe(false)
  })

  it('accepts null folder_id', () => {
    expect(updateDocumentSchema.safeParse({ folder_id: null }).success).toBe(true)
  })

  it('accepts valid UUID folder_id', () => {
    expect(updateDocumentSchema.safeParse({ folder_id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID folder_id', () => {
    expect(updateDocumentSchema.safeParse({ folder_id: 'bad' }).success).toBe(false)
  })

  it('accepts tag_ids array', () => {
    expect(updateDocumentSchema.safeParse({ tag_ids: [VALID_UUID] }).success).toBe(true)
  })

  it('rejects non-UUID tag_id', () => {
    expect(updateDocumentSchema.safeParse({ tag_ids: ['not-uuid'] }).success).toBe(false)
  })
})

// ─── idParamSchema ────────────────────────────────────────────────────────────

describe('idParamSchema', () => {
  it('accepts valid UUID', () => {
    expect(idParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(idParamSchema.safeParse({ id: 'bad' }).success).toBe(false)
  })
})

// ─── createFolderSchema ───────────────────────────────────────────────────────

describe('createFolderSchema', () => {
  it('accepts valid folder name', () => {
    expect(createFolderSchema.safeParse({ name: 'my-folder' }).success).toBe(true)
  })

  it('accepts alphanumeric with hyphens and underscores', () => {
    expect(createFolderSchema.safeParse({ name: 'My_Folder-123' }).success).toBe(true)
  })

  it('rejects name with spaces', () => {
    expect(createFolderSchema.safeParse({ name: 'my folder' }).success).toBe(false)
  })

  it('rejects name with special characters', () => {
    expect(createFolderSchema.safeParse({ name: 'folder!' }).success).toBe(false)
  })

  it('rejects empty name', () => {
    expect(createFolderSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects name exceeding 50 chars', () => {
    expect(createFolderSchema.safeParse({ name: 'a'.repeat(51) }).success).toBe(false)
  })

  it('accepts name at exactly 50 chars', () => {
    expect(createFolderSchema.safeParse({ name: 'a'.repeat(50) }).success).toBe(true)
  })

  it('accepts optional null parent_id', () => {
    expect(createFolderSchema.safeParse({ name: 'folder', parent_id: null }).success).toBe(true)
  })

  it('accepts valid UUID parent_id', () => {
    expect(createFolderSchema.safeParse({ name: 'folder', parent_id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID parent_id', () => {
    expect(createFolderSchema.safeParse({ name: 'folder', parent_id: 'bad' }).success).toBe(false)
  })
})

// ─── updateFolderSchema ───────────────────────────────────────────────────────

describe('updateFolderSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(updateFolderSchema.safeParse({}).success).toBe(true)
  })

  it('accepts valid name', () => {
    expect(updateFolderSchema.safeParse({ name: 'new-name' }).success).toBe(true)
  })

  it('rejects name with spaces', () => {
    expect(updateFolderSchema.safeParse({ name: 'bad name' }).success).toBe(false)
  })

  it('accepts null parent_id', () => {
    expect(updateFolderSchema.safeParse({ parent_id: null }).success).toBe(true)
  })
})

// ─── listFoldersQuerySchema ───────────────────────────────────────────────────

describe('listFoldersQuerySchema', () => {
  it('accepts empty object', () => {
    expect(listFoldersQuerySchema.safeParse({}).success).toBe(true)
  })

  it('accepts flat "true"', () => {
    expect(listFoldersQuerySchema.safeParse({ flat: 'true' }).success).toBe(true)
  })

  it('rejects flat "yes"', () => {
    expect(listFoldersQuerySchema.safeParse({ flat: 'yes' }).success).toBe(false)
  })

  it('accepts include_deleted "false"', () => {
    expect(listFoldersQuerySchema.safeParse({ include_deleted: 'false' }).success).toBe(true)
  })
})

// ─── createTagSchema ──────────────────────────────────────────────────────────

describe('createTagSchema', () => {
  it('accepts valid tag', () => {
    expect(createTagSchema.safeParse({ name: 'Work', color: '#3b82f6' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(createTagSchema.safeParse({ name: '', color: '#3b82f6' }).success).toBe(false)
  })

  it('rejects name exceeding 100 chars', () => {
    expect(createTagSchema.safeParse({ name: 'a'.repeat(101), color: '#3b82f6' }).success).toBe(false)
  })

  it('rejects invalid hex color (no hash)', () => {
    expect(createTagSchema.safeParse({ name: 'Work', color: '3b82f6' }).success).toBe(false)
  })

  it('rejects invalid hex color (wrong length)', () => {
    expect(createTagSchema.safeParse({ name: 'Work', color: '#3b82' }).success).toBe(false)
  })

  it('rejects invalid hex color (non-hex chars)', () => {
    expect(createTagSchema.safeParse({ name: 'Work', color: '#gggggg' }).success).toBe(false)
  })

  it('accepts uppercase hex', () => {
    expect(createTagSchema.safeParse({ name: 'Work', color: '#3B82F6' }).success).toBe(true)
  })
})

// ─── updateTagSchema ──────────────────────────────────────────────────────────

describe('updateTagSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(updateTagSchema.safeParse({}).success).toBe(true)
  })

  it('accepts name only', () => {
    expect(updateTagSchema.safeParse({ name: 'Updated' }).success).toBe(true)
  })

  it('accepts color only', () => {
    expect(updateTagSchema.safeParse({ color: '#ff0000' }).success).toBe(true)
  })

  it('rejects invalid color', () => {
    expect(updateTagSchema.safeParse({ color: 'red' }).success).toBe(false)
  })
})

// ─── DocumentSettingsBodySchema ───────────────────────────────────────────────

describe('DocumentSettingsBodySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(DocumentSettingsBodySchema.safeParse({}).success).toBe(true)
  })

  it('accepts onboardingCompleted boolean', () => {
    expect(DocumentSettingsBodySchema.safeParse({ onboardingCompleted: true }).success).toBe(true)
  })

  it('accepts defaultView "cards"', () => {
    expect(DocumentSettingsBodySchema.safeParse({ defaultView: 'cards' }).success).toBe(true)
  })

  it('accepts defaultView "table"', () => {
    expect(DocumentSettingsBodySchema.safeParse({ defaultView: 'table' }).success).toBe(true)
  })

  it('rejects invalid defaultView', () => {
    expect(DocumentSettingsBodySchema.safeParse({ defaultView: 'grid' }).success).toBe(false)
  })

  it('accepts maxFileSizeMb within range', () => {
    expect(DocumentSettingsBodySchema.safeParse({ maxFileSizeMb: 25 }).success).toBe(true)
  })

  it('rejects maxFileSizeMb less than 1', () => {
    expect(DocumentSettingsBodySchema.safeParse({ maxFileSizeMb: 0 }).success).toBe(false)
  })

  it('rejects maxFileSizeMb greater than MAX_UPLOAD_MB', () => {
    expect(DocumentSettingsBodySchema.safeParse({ maxFileSizeMb: MAX_UPLOAD_MB + 1 }).success).toBe(false)
  })

  it('accepts allowedFileTypes array', () => {
    expect(DocumentSettingsBodySchema.safeParse({ allowedFileTypes: ['image/png', 'application/pdf'] }).success).toBe(true)
  })

  it('rejects unknown extra keys (strict)', () => {
    expect(DocumentSettingsBodySchema.safeParse({ unknownField: true }).success).toBe(false)
  })
})

// ─── DocumentSettingsResponseSchema ──────────────────────────────────────────

describe('DocumentSettingsResponseSchema', () => {
  const valid = {
    globalProvider: {
      provider: 'local',
      label: 'Local Filesystem',
      source: 'default' as const,
    },
  }

  it('accepts valid settings response', () => {
    expect(DocumentSettingsResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects invalid globalProvider.source', () => {
    expect(DocumentSettingsResponseSchema.safeParse({
      globalProvider: { provider: 'local', label: 'Local', source: 'config' },
    }).success).toBe(false)
  })

  it('accepts passthrough extra fields', () => {
    expect(DocumentSettingsResponseSchema.safeParse({ ...valid, extraField: 'yes' }).success).toBe(true)
  })
})

// ─── emptyTrashQuerySchema ────────────────────────────────────────────────────

describe('emptyTrashQuerySchema', () => {
  it('accepts empty object', () => {
    expect(emptyTrashQuerySchema.safeParse({}).success).toBe(true)
  })

  it('accepts auto "true"', () => {
    expect(emptyTrashQuerySchema.safeParse({ auto: 'true' }).success).toBe(true)
  })

  it('rejects auto "yes"', () => {
    expect(emptyTrashQuerySchema.safeParse({ auto: 'yes' }).success).toBe(false)
  })
})

// ─── EmptyTrashResponseSchema ─────────────────────────────────────────────────

describe('EmptyTrashResponseSchema', () => {
  const valid = { success: true as const, message: 'Done', documents_deleted: 0, folders_deleted: 0 }

  it('accepts valid response without storage_errors', () => {
    expect(EmptyTrashResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts optional storage_errors array', () => {
    expect(EmptyTrashResponseSchema.safeParse({ ...valid, storage_errors: ['err1'] }).success).toBe(true)
  })

  it('rejects negative documents_deleted', () => {
    expect(EmptyTrashResponseSchema.safeParse({ ...valid, documents_deleted: -1 }).success).toBe(false)
  })
})

// ─── trashDeleteQuerySchema ───────────────────────────────────────────────────

describe('trashDeleteQuerySchema', () => {
  it('accepts valid UUID id', () => {
    expect(trashDeleteQuerySchema.safeParse({ id: VALID_UUID }).success).toBe(true)
  })

  it('accepts optional type "document"', () => {
    expect(trashDeleteQuerySchema.safeParse({ id: VALID_UUID, type: 'document' }).success).toBe(true)
  })

  it('accepts optional type "folder"', () => {
    expect(trashDeleteQuerySchema.safeParse({ id: VALID_UUID, type: 'folder' }).success).toBe(true)
  })

  it('rejects invalid type', () => {
    expect(trashDeleteQuerySchema.safeParse({ id: VALID_UUID, type: 'tag' }).success).toBe(false)
  })

  it('rejects non-UUID id', () => {
    expect(trashDeleteQuerySchema.safeParse({ id: 'bad' }).success).toBe(false)
  })
})

// ─── DocumentSoftDeleteResponseSchema ─────────────────────────────────────────

describe('DocumentSoftDeleteResponseSchema', () => {
  it('accepts valid response', () => {
    expect(DocumentSoftDeleteResponseSchema.safeParse({ success: true, message: 'Deleted' }).success).toBe(true)
  })

  it('rejects success: false', () => {
    expect(DocumentSoftDeleteResponseSchema.safeParse({ success: false, message: 'Nope' }).success).toBe(false)
  })
})

// ─── DownloadResponseSchema ───────────────────────────────────────────────────

describe('DownloadResponseSchema', () => {
  const valid = {
    url: 'https://cdn.example.com/file.pdf',
    filename: 'report.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    expires_at: '2024-01-01T01:00:00Z',
  }

  it('accepts valid download response', () => {
    expect(DownloadResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects negative size_bytes', () => {
    expect(DownloadResponseSchema.safeParse({ ...valid, size_bytes: -1 }).success).toBe(false)
  })
})

// ─── RestoreDocumentResponseSchema ───────────────────────────────────────────

describe('RestoreDocumentResponseSchema', () => {
  const document = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'file.pdf',
    original_name: 'file.pdf',
    storage_provider: 'local',
    storage_path: '/path',
    storage_bucket: null,
    size_bytes: 0,
    mime_type: 'application/pdf',
    folder_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
  }

  it('accepts valid restore response', () => {
    expect(RestoreDocumentResponseSchema.safeParse({ success: true, message: 'Restored', document }).success).toBe(true)
  })
})

// ─── Response / list schemas ──────────────────────────────────────────────────

describe('DocumentSingleResponseSchema', () => {
  const document = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'f',
    original_name: 'f',
    storage_provider: 'local',
    storage_path: '/p',
    storage_bucket: null,
    size_bytes: 0,
    mime_type: 'text/plain',
    folder_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
  }
  it('accepts valid response', () => {
    expect(DocumentSingleResponseSchema.safeParse({ document }).success).toBe(true)
  })
})

describe('FolderListResponseSchema', () => {
  it('accepts empty folders array', () => {
    expect(FolderListResponseSchema.safeParse({ folders: [], count: 0 }).success).toBe(true)
  })
})

describe('FolderSingleResponseSchema', () => {
  const folder = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'folder',
    parent_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    document_count: 0,
  }
  it('accepts valid folder response', () => {
    expect(FolderSingleResponseSchema.safeParse({ folder }).success).toBe(true)
  })
})

describe('FolderDeleteResponseSchema', () => {
  it('accepts valid response', () => {
    expect(FolderDeleteResponseSchema.safeParse({ success: true, message: 'Done', folders_affected: 1 }).success).toBe(true)
  })
})

describe('DocumentTagWithCountSchema', () => {
  const valid = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'tag',
    color: '#000000',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
    usage_count: 5,
  }
  it('accepts valid tag with count', () => {
    expect(DocumentTagWithCountSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects negative usage_count', () => {
    expect(DocumentTagWithCountSchema.safeParse({ ...valid, usage_count: -1 }).success).toBe(false)
  })
})

describe('TagListResponseSchema', () => {
  it('accepts empty tags array', () => {
    expect(TagListResponseSchema.safeParse({ tags: [], count: 0 }).success).toBe(true)
  })
})

describe('TagSingleResponseSchema', () => {
  const tag = {
    id: VALID_UUID,
    user_id: 'u',
    name: 'tag',
    color: '#ff0000',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
  }
  it('accepts valid tag response', () => {
    expect(TagSingleResponseSchema.safeParse({ tag }).success).toBe(true)
  })
})

describe('TagDeleteResponseSchema', () => {
  it('accepts valid delete response', () => {
    expect(TagDeleteResponseSchema.safeParse({ success: true, message: 'Deleted' }).success).toBe(true)
  })
})

describe('DocumentSettingsSaveResponseSchema', () => {
  it('accepts valid save response', () => {
    expect(DocumentSettingsSaveResponseSchema.safeParse({ success: true, message: 'Saved' }).success).toBe(true)
  })
})

describe('UploadFileFormSchema', () => {
  it('accepts valid file with optional folder_id', () => {
    expect(UploadFileFormSchema.safeParse({ file: 'some-blob' }).success).toBe(true)
  })

  it('accepts with folder_id UUID', () => {
    expect(UploadFileFormSchema.safeParse({ file: 'blob', folder_id: VALID_UUID }).success).toBe(true)
  })

  it('rejects non-UUID folder_id', () => {
    expect(UploadFileFormSchema.safeParse({ file: 'blob', folder_id: 'bad' }).success).toBe(false)
  })
})

describe('TrashItemDeleteResponseSchema', () => {
  it('accepts valid response', () => {
    expect(TrashItemDeleteResponseSchema.safeParse({ success: true, message: 'Done' }).success).toBe(true)
  })
})
