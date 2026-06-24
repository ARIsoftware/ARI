/**
 * Motivation — TanStack Query hooks for videos + settings.
 *
 * Mutations are optimistic: the UI updates immediately and rolls back
 * on server error. The mutation's `onSuccess` is what dialogs should
 * watch — never close on the click event.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import type { MotivationSettings, MotivationVideo } from '../types'

const VIDEOS_KEY = ['motivation', 'videos']
const SETTINGS_KEY = ['motivation', 'settings']
const QUOTES_KEY = ['motivation', 'quotes-pool']

// Page size for the videos grid. Mirrors LIST_LIMIT_DEFAULT in lib/validation.ts
// (the server clamps to its own max regardless) — keep them in sync.
export const MOTIVATION_PAGE_SIZE = 60

interface VideosPage {
  videos: MotivationVideo[]
  total: number
  limit: number
  offset: number
}

// Map the deleted id out of every cached page and decrement the (duplicated)
// total. onSettled re-fetches the canonical total, so this is transient.
function removeFromPages(
  old: InfiniteData<VideosPage> | undefined,
  deletedId: string,
): InfiniteData<VideosPage> | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((p) => ({
      ...p,
      total: Math.max(0, p.total - 1),
      videos: p.videos.filter((v) => v.id !== deletedId),
    })),
  }
}

// Apply a new id ordering to the flattened pages, then re-chunk preserving each
// page's original size. `ids` always covers exactly the loaded videos, so the
// reordered list and the flattened list have the same length.
function reorderPages(
  old: InfiniteData<VideosPage> | undefined,
  ids: string[],
): InfiniteData<VideosPage> | undefined {
  if (!old) return old
  const flat = old.pages.flatMap((p) => p.videos)
  const byId = new Map(flat.map((v) => [v.id, v]))
  const reordered = ids
    .map((id, index) => {
      const v = byId.get(id)
      return v ? { ...v, position: index + 1 } : null
    })
    .filter((v): v is MotivationVideo => v !== null)
  let cursor = 0
  const pages = old.pages.map((p) => {
    const slice = reordered.slice(cursor, cursor + p.videos.length)
    cursor += p.videos.length
    return { ...p, videos: slice }
  })
  return { ...old, pages }
}

export interface MotivationQuote {
  quote: string
  author?: string
}

interface ZodIssue {
  message?: string
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    const details = Array.isArray(body?.details)
      ? body.details.map((d: ZodIssue) => d?.message).filter(Boolean).join(', ')
      : ''
    return details || body?.error || fallback
  } catch {
    return fallback
  }
}

/**
 * Fetch the quotes pool from the optional quotes module. Cached by the
 * global staleTime so navigating away and back doesn't re-fetch.
 * `enabled` should be `quotesEnabled && !quotesLoading`.
 */
export function useQuotesPool(enabled: boolean) {
  return useQuery({
    queryKey: QUOTES_KEY,
    enabled,
    queryFn: async (): Promise<MotivationQuote[]> => {
      const res = await fetch('/api/modules/quotes/quotes')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
  })
}

/**
 * Paginated videos query. Returns a flattened `videos` array plus "load more"
 * controls. Pages are fetched with offset paging (limit = MOTIVATION_PAGE_SIZE).
 */
export function useMotivationVideos() {
  const query = useInfiniteQuery({
    queryKey: VIDEOS_KEY,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<VideosPage> => {
      const params = new URLSearchParams({
        limit: String(MOTIVATION_PAGE_SIZE),
        offset: String(pageParam),
      })
      const res = await fetch(`/api/modules/motivation/videos?${params.toString()}`)
      if (!res.ok) throw new Error(await extractErrorMessage(res, 'Failed to load videos'))
      const data = await res.json()
      return {
        videos: data.videos ?? [],
        total: data.total ?? (data.videos?.length ?? 0),
        limit: data.limit ?? MOTIVATION_PAGE_SIZE,
        offset: data.offset ?? Number(pageParam),
      }
    },
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.offset + lastPage.videos.length
      return loaded < lastPage.total ? loaded : undefined
    },
  })

  const videos = query.data?.pages.flatMap((p) => p.videos) ?? []
  const total = query.data?.pages[0]?.total ?? 0

  return {
    videos,
    total,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

export function useAddMotivationVideo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (url: string): Promise<MotivationVideo> => {
      const res = await fetch('/api/modules/motivation/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, 'Failed to add video'))
      const data = await res.json()
      return data.video
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: VIDEOS_KEY })
    },
  })
}

export function useDeleteMotivationVideo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/motivation/videos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, 'Failed to delete video'))
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: VIDEOS_KEY })
      const previous = queryClient.getQueryData<InfiniteData<VideosPage>>(VIDEOS_KEY)
      queryClient.setQueryData<InfiniteData<VideosPage>>(VIDEOS_KEY, (old) =>
        removeFromPages(old, deletedId),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(VIDEOS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: VIDEOS_KEY })
    },
  })
}

export function useReorderMotivationVideos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      const res = await fetch('/api/modules/motivation/videos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, 'Failed to save order'))
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: VIDEOS_KEY })
      const previous = queryClient.getQueryData<InfiniteData<VideosPage>>(VIDEOS_KEY)
      queryClient.setQueryData<InfiniteData<VideosPage>>(VIDEOS_KEY, (old) =>
        reorderPages(old, ids),
      )
      return { previous }
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(VIDEOS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: VIDEOS_KEY })
    },
  })
}

export function useMotivationSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<MotivationSettings>> => {
      const res = await fetch('/api/modules/motivation/settings')
      if (!res.ok) return {}
      return await res.json()
    },
  })
}

export function useUpdateMotivationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<MotivationSettings>): Promise<void> => {
      const res = await fetch('/api/modules/motivation/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, 'Failed to save settings'))
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<MotivationSettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<MotivationSettings>>(SETTINGS_KEY, (old = {}) => ({
        ...old,
        ...newSettings,
      }))
      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SETTINGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
      // Sort order affects video list ordering, so invalidate that too.
      queryClient.invalidateQueries({ queryKey: VIDEOS_KEY })
    },
  })
}
