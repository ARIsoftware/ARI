/**
 * Motivation — TanStack Query hooks for videos + settings.
 *
 * Mutations are optimistic: the UI updates immediately and rolls back
 * on server error. The mutation's `onSuccess` is what dialogs should
 * watch — never close on the click event.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MotivationSettings, MotivationVideo } from '../types'

const VIDEOS_KEY = ['motivation', 'videos']
const SETTINGS_KEY = ['motivation', 'settings']
const QUOTES_KEY = ['motivation', 'quotes-pool']

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

export function useMotivationVideos() {
  return useQuery({
    queryKey: VIDEOS_KEY,
    queryFn: async (): Promise<MotivationVideo[]> => {
      const res = await fetch('/api/modules/motivation/videos')
      if (!res.ok) throw new Error(await extractErrorMessage(res, 'Failed to load videos'))
      const data = await res.json()
      return data.videos ?? []
    },
  })
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
      const previous = queryClient.getQueryData<MotivationVideo[]>(VIDEOS_KEY)
      queryClient.setQueryData<MotivationVideo[]>(VIDEOS_KEY, (old = []) =>
        old.filter((v) => v.id !== deletedId),
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
      const previous = queryClient.getQueryData<MotivationVideo[]>(VIDEOS_KEY)
      if (previous) {
        const byId = new Map(previous.map((v) => [v.id, v]))
        const next = ids.map((id, index) => {
          const v = byId.get(id)
          return v ? { ...v, position: index + 1 } : null
        }).filter((v): v is MotivationVideo => v !== null)
        queryClient.setQueryData<MotivationVideo[]>(VIDEOS_KEY, next)
      }
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
