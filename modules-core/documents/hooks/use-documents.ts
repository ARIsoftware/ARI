/**
 * Documents Module - TanStack Query Hooks
 *
 * Provides data fetching hooks with:
 * - Automatic caching and deduplication
 * - Optimistic updates for instant UI feedback
 * - Background refetching
 * - Error handling
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import type {
  Document,
  DocumentWithTags,
  DocumentFolder,
  FolderWithChildren,
  DocumentTag,
  DocumentsSettings,
  DocumentsSettingsResponse,
  DocumentFilters,
  UpdateDocumentRequest,
  CreateFolderRequest,
  UpdateFolderRequest,
  CreateTagRequest,
  UpdateTagRequest,
} from '../types'
import { DEFAULT_DOCUMENTS_SETTINGS } from '../types'

// Query keys
const DOCUMENTS_KEY = ['documents-files']
const FOLDERS_KEY = ['documents-folders']
const TAGS_KEY = ['documents-tags']
const SETTINGS_KEY = ['documents-settings']
const TRASH_KEY = ['documents-trash']

// Settings Hooks

export function useDocumentsSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<DocumentsSettingsResponse> => {
      const res = await fetch('/api/modules/documents/settings')
      // 404 = no settings row yet (fresh install). Return defaults so the
      // onboarding flow can bootstrap without an error toast.
      if (res.status === 404) {
        return {
          ...DEFAULT_DOCUMENTS_SETTINGS,
          globalProvider: { provider: 'local', label: 'Local Filesystem', source: 'default' },
        }
      }
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to fetch settings')
      }
      return await res.json()
    },
    staleTime: Infinity,
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
      const previous = queryClient.getQueryData<DocumentsSettingsResponse>(SETTINGS_KEY)

      queryClient.setQueryData<DocumentsSettingsResponse>(SETTINGS_KEY, (old) => ({
        ...old,
        ...newSettings,
      } as DocumentsSettingsResponse))

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

// Documents Hooks

// One page of the files list, as returned by GET /files (limit/offset + has_more).
const DOCUMENTS_PAGE_SIZE = 50

export type DocumentsPage = {
  files: DocumentWithTags[]
  count: number
  limit: number
  offset: number
  has_more: boolean
}

// Paginated documents list. Pages are fetched 50-at-a-time via the files API's
// limit/offset; `has_more` drives `hasNextPage` so the UI can offer "Load more"
// instead of silently capping the list at the first page.
export function useDocuments(filters?: DocumentFilters & { with_previews?: boolean }) {
  const params = new URLSearchParams()
  if (filters?.folder_id !== undefined) {
    params.set('folder_id', filters.folder_id || 'root')
  }
  if (filters?.search) params.set('search', filters.search)
  if (filters?.mime_types?.length) params.set('mime_types', filters.mime_types.join(','))
  if (filters?.tag_ids?.length) params.set('tag_ids', filters.tag_ids.join(','))
  if (filters?.date_from) params.set('date_from', filters.date_from)
  if (filters?.date_to) params.set('date_to', filters.date_to)
  if (filters?.with_previews === false) params.set('with_previews', 'false')
  params.set('limit', String(DOCUMENTS_PAGE_SIZE))

  const queryString = params.toString()

  return useInfiniteQuery({
    queryKey: [...DOCUMENTS_KEY, queryString],
    queryFn: async ({ pageParam }): Promise<DocumentsPage> => {
      const res = await fetch(`/api/modules/documents/files?${queryString}&offset=${pageParam}`)
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to fetch documents')
      }
      return await res.json()
    },
    initialPageParam: 0,
    // Advance by one page until the API reports no more rows. The API clamps
    // offset at 10_000, so stop there too — requesting beyond it would just
    // re-fetch the clamped final page indefinitely.
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more) return undefined
      const next = lastPage.offset + lastPage.limit
      return next <= 10_000 ? next : undefined
    },
  })
}

// Apply a transform to the files of every page in the infinite documents cache,
// recomputing each page's count. Used by the optimistic mutations below so they
// stay correct against the paged ({ pages: [...] }) cache shape.
function mapDocumentsPages(
  old: InfiniteData<DocumentsPage> | undefined,
  transform: (files: DocumentWithTags[]) => DocumentWithTags[],
): InfiniteData<DocumentsPage> | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => {
      const files = transform(page.files)
      return { ...page, files, count: files.length }
    }),
  }
}

export function useTrashDocuments() {
  return useQuery({
    queryKey: TRASH_KEY,
    queryFn: async (): Promise<{ files: DocumentWithTags[]; count: number }> => {
      // Server filters via the deleted_only=true param — no client-side filter needed.
      const res = await fetch('/api/modules/documents/files?deleted_only=true&limit=200')
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to fetch trash')
      }
      const data = await res.json()
      return { files: data.files, count: data.count }
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
      const previous = queryClient.getQueriesData<InfiniteData<DocumentsPage>>({
        queryKey: DOCUMENTS_KEY,
      })
      queryClient.setQueriesData<InfiniteData<DocumentsPage>>(
        { queryKey: DOCUMENTS_KEY },
        (old) => mapDocumentsPages(old, (files) => files.filter((f) => f.id !== deletedId)),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
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

// Bulk Operations Hooks

async function bulkFiles(body: object): Promise<void> {
  const res = await fetch('/api/modules/documents/files', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Bulk operation failed')
  }
}

export function useBulkDeleteDocuments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => bulkFiles({ action: 'delete', ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: DOCUMENTS_KEY })
      const previous = queryClient.getQueriesData<InfiniteData<DocumentsPage>>({
        queryKey: DOCUMENTS_KEY,
      })
      const toRemove = new Set(ids)
      queryClient.setQueriesData<InfiniteData<DocumentsPage>>(
        { queryKey: DOCUMENTS_KEY },
        (old) => mapDocumentsPages(old, (files) => files.filter((f) => !toRemove.has(f.id))),
      )
      return { previous }
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
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
    mutationFn: ({ ids, folderId }: { ids: string[]; folderId: string | null }) =>
      bulkFiles({ action: 'move', ids, folder_id: folderId }),
    onMutate: async ({ ids, folderId }) => {
      await queryClient.cancelQueries({ queryKey: DOCUMENTS_KEY })
      const previous = queryClient.getQueriesData<InfiniteData<DocumentsPage>>({
        queryKey: DOCUMENTS_KEY,
      })
      const moving = new Set(ids)
      queryClient.setQueriesData<InfiniteData<DocumentsPage>>(
        { queryKey: DOCUMENTS_KEY },
        (old) => mapDocumentsPages(old, (files) =>
          files.map((f) =>
            moving.has(f.id) ? ({ ...f, folder_id: folderId } as DocumentWithTags) : f
          ),
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
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
    mutationFn: ({ ids, tagIds }: { ids: string[]; tagIds: string[] }) =>
      bulkFiles({ action: 'tag', ids, tag_ids: tagIds }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY })
    },
  })
}

// Folders Hooks

export function useFolders(flat: boolean = false) {
  return useQuery({
    queryKey: [...FOLDERS_KEY, flat ? 'flat' : 'tree'],
    queryFn: async (): Promise<{ folders: FolderWithChildren[]; count: number }> => {
      const res = await fetch(`/api/modules/documents/folders?flat=${flat}`)
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to fetch folders')
      }
      return await res.json()
    },
    staleTime: 60_000,
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

// Tags Hooks

export function useTags() {
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: async (): Promise<{ tags: (DocumentTag & { usage_count: number })[]; count: number }> => {
      const res = await fetch('/api/modules/documents/tags')
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to fetch tags')
      }
      return await res.json()
    },
    staleTime: 60_000,
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

// Trash Hooks

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
