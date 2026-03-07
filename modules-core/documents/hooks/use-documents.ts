/**
 * Documents Module - TanStack Query Hooks
 *
 * Provides data fetching hooks with:
 * - Automatic caching and deduplication
 * - Optimistic updates for instant UI feedback
 * - Background refetching
 * - Error handling
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Document,
  DocumentWithTags,
  DocumentFolder,
  FolderWithChildren,
  DocumentTag,
  DocumentsSettings,
  DocumentFilters,
  UpdateDocumentRequest,
  CreateFolderRequest,
  UpdateFolderRequest,
  CreateTagRequest,
  UpdateTagRequest,
} from '../types'

// Query keys
const DOCUMENTS_KEY = ['documents-files']
const FOLDERS_KEY = ['documents-folders']
const TAGS_KEY = ['documents-tags']
const SETTINGS_KEY = ['documents-settings']
const TRASH_KEY = ['documents-trash']

// ============================================================================
// Settings Hooks
// ============================================================================

export function useDocumentsSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<DocumentsSettings> => {
      const res = await fetch('/api/modules/documents/settings')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch settings')
      }
      return await res.json()
    },
  })
}

export function useUpdateDocumentsSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<DocumentsSettings>): Promise<void> => {
      const res = await fetch('/api/modules/documents/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save settings')
      }
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<DocumentsSettings>(SETTINGS_KEY)

      queryClient.setQueryData<DocumentsSettings>(SETTINGS_KEY, (old) => ({
        ...old,
        ...newSettings,
      } as DocumentsSettings))

      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SETTINGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

// ============================================================================
// Documents Hooks
// ============================================================================

export function useDocuments(filters?: DocumentFilters) {
  const params = new URLSearchParams()
  if (filters?.folder_id !== undefined) {
    params.set('folder_id', filters.folder_id || 'root')
  }
  if (filters?.search) params.set('search', filters.search)
  if (filters?.mime_types?.length) params.set('mime_types', filters.mime_types.join(','))
  if (filters?.tag_ids?.length) params.set('tag_ids', filters.tag_ids.join(','))
  if (filters?.date_from) params.set('date_from', filters.date_from)
  if (filters?.date_to) params.set('date_to', filters.date_to)

  const queryString = params.toString()

  return useQuery({
    queryKey: [...DOCUMENTS_KEY, queryString],
    queryFn: async (): Promise<{ files: DocumentWithTags[]; count: number }> => {
      const res = await fetch(`/api/modules/documents/files?${queryString}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch documents')
      }
      return await res.json()
    },
  })
}

export function useTrashDocuments() {
  return useQuery({
    queryKey: TRASH_KEY,
    queryFn: async (): Promise<{ files: DocumentWithTags[]; count: number }> => {
      const res = await fetch('/api/modules/documents/files?include_deleted=true')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch trash')
      }
      const data = await res.json()
      // Filter to only deleted items
      const trashedFiles = data.files.filter((f: any) => f.deleted_at !== null)
      return { files: trashedFiles, count: trashedFiles.length }
    },
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      folderId,
      tagIds,
    }: {
      file: File
      folderId?: string | null
      tagIds?: string[]
    }): Promise<Document> => {
      const formData = new FormData()
      formData.append('file', file)
      if (folderId) formData.append('folder_id', folderId)
      if (tagIds?.length) formData.append('tag_ids', tagIds.join(','))

      const res = await fetch('/api/modules/documents/files', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to upload document')
      }
      const data = await res.json()
      return data.document
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useUpdateDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: UpdateDocumentRequest
    }): Promise<Document> => {
      const res = await fetch(`/api/modules/documents/files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update document')
      }
      const result = await res.json()
      return result.document
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/documents/files/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete document')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: DOCUMENTS_KEY })
      // Optimistically remove from cache
      queryClient.setQueriesData<{ files: DocumentWithTags[]; count: number }>(
        { queryKey: DOCUMENTS_KEY },
        (old) => {
          if (!old) return old
          return {
            files: old.files.filter((f) => f.id !== deletedId),
            count: old.count - 1,
          }
        }
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: TRASH_KEY })
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useRestoreDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<Document> => {
      const res = await fetch(`/api/modules/documents/files/${id}/restore`, {
        method: 'POST',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to restore document')
      }
      const result = await res.json()
      return result.document
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: TRASH_KEY })
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async (id: string): Promise<{ url: string; filename: string }> => {
      const res = await fetch(`/api/modules/documents/files/${id}/download`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to get download URL')
      }
      return await res.json()
    },
  })
}

// ============================================================================
// Bulk Operations Hooks
// ============================================================================

export function useBulkDeleteDocuments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/modules/documents/files/${id}`, { method: 'DELETE' })
        )
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: TRASH_KEY })
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useBulkMoveDocuments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      ids,
      folderId,
    }: {
      ids: string[]
      folderId: string | null
    }): Promise<void> => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/modules/documents/files/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: folderId }),
          })
        )
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useBulkTagDocuments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      ids,
      tagIds,
    }: {
      ids: string[]
      tagIds: string[]
    }): Promise<void> => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/modules/documents/files/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_ids: tagIds }),
          })
        )
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
    },
  })
}

// ============================================================================
// Folders Hooks
// ============================================================================

export function useFolders(flat: boolean = false) {
  return useQuery({
    queryKey: [...FOLDERS_KEY, flat ? 'flat' : 'tree'],
    queryFn: async (): Promise<{ folders: FolderWithChildren[]; count: number }> => {
      const res = await fetch(`/api/modules/documents/folders?flat=${flat}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch folders')
      }
      return await res.json()
    },
  })
}

export function useCreateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateFolderRequest): Promise<DocumentFolder> => {
      const res = await fetch('/api/modules/documents/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create folder')
      }
      const result = await res.json()
      return result.folder
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useUpdateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: UpdateFolderRequest
    }): Promise<DocumentFolder> => {
      const res = await fetch(`/api/modules/documents/folders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update folder')
      }
      const result = await res.json()
      return result.folder
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function useDeleteFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/documents/folders/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete folder')
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: TRASH_KEY })
    },
  })
}

// ============================================================================
// Tags Hooks
// ============================================================================

export function useTags() {
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: async (): Promise<{ tags: (DocumentTag & { usage_count: number })[]; count: number }> => {
      const res = await fetch('/api/modules/documents/tags')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch tags')
      }
      return await res.json()
    },
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateTagRequest): Promise<DocumentTag> => {
      const res = await fetch('/api/modules/documents/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create tag')
      }
      const result = await res.json()
      return result.tag
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: UpdateTagRequest
    }): Promise<DocumentTag> => {
      const res = await fetch(`/api/modules/documents/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update tag')
      }
      const result = await res.json()
      return result.tag
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY })
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/documents/tags/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete tag')
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_KEY })
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
    },
  })
}

// ============================================================================
// Trash Hooks
// ============================================================================

export function useEmptyTrash() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch('/api/modules/documents/trash/empty', {
        method: 'POST',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to empty trash')
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRASH_KEY })
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY })
    },
  })
}

export function usePermanentlyDeleteDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/documents/trash/empty?id=${id}&type=document`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to permanently delete document')
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRASH_KEY })
    },
  })
}
