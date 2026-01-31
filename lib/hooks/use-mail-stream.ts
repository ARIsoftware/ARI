/**
 * Mail Stream Module - TanStack Query Hooks
 *
 * Provides data fetching hooks for the mail-stream module.
 * Uses TanStack Query for caching, background refetching, and optimistic updates.
 *
 * Usage:
 *   import { useMailStreamEvents, useMailStreamSettings } from '@/lib/hooks/use-mail-stream'
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  MailStreamEvent,
  MailStreamSettings,
  MailStreamFilters
} from '@/modules/mail-stream/types'

// Query keys
const EVENTS_KEY = ['mail-stream-events']
const SETTINGS_KEY = ['mail-stream-settings']

/**
 * Build query string from filters
 */
function buildQueryString(filters: MailStreamFilters, limit: number, offset: number): string {
  const params = new URLSearchParams()
  if (filters.category !== 'all') params.set('category', filters.category)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.search) params.set('search', filters.search)
  params.set('limit', limit.toString())
  params.set('offset', offset.toString())
  return params.toString()
}

/**
 * Fetch mail stream events with filtering
 */
export function useMailStreamEvents(
  filters: MailStreamFilters = { category: 'all', status: 'all', search: '' },
  limit: number = 100,
  offset: number = 0
) {
  return useQuery({
    queryKey: [...EVENTS_KEY, filters, limit, offset],
    queryFn: async (): Promise<{ events: MailStreamEvent[]; count: number; total: number }> => {
      const queryString = buildQueryString(filters, limit, offset)
      const res = await fetch(`/api/modules/mail-stream/data?${queryString}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch events')
      }
      return await res.json()
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })
}

/**
 * Delete an event with optimistic updates
 */
export function useDeleteMailStreamEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/mail-stream/data?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete event')
      }
    },
    onMutate: async (deletedId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: EVENTS_KEY })

      // Snapshot the previous value
      const previousQueries = queryClient.getQueriesData({ queryKey: EVENTS_KEY })

      // Optimistically update all event queries
      queryClient.setQueriesData({ queryKey: EVENTS_KEY }, (old: any) => {
        if (!old || !old.events) return old
        return {
          ...old,
          events: old.events.filter((e: MailStreamEvent) => e.id !== deletedId),
          count: old.count - 1,
          total: old.total - 1
        }
      })

      return { previousQueries }
    },
    onError: (_err, _deletedId, context) => {
      // Rollback on error
      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]) => {
          queryClient.setQueryData(key, data)
        })
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY })
    },
  })
}

/**
 * Fetch mail stream settings
 */
export function useMailStreamSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<MailStreamSettings> => {
      const res = await fetch('/api/modules/mail-stream/settings')
      if (!res.ok) {
        // Return defaults if error
        return { retention_days: -1, setup_complete: false }
      }
      const data = await res.json()
      return data.settings
    },
  })
}

/**
 * Update mail stream settings
 */
export function useUpdateMailStreamSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<MailStreamSettings>): Promise<void> => {
      const res = await fetch('/api/modules/mail-stream/settings', {
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
      const previous = queryClient.getQueryData<MailStreamSettings>(SETTINGS_KEY)

      queryClient.setQueryData<MailStreamSettings>(SETTINGS_KEY, (old) => ({
        ...old,
        ...newSettings,
      } as MailStreamSettings))

      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SETTINGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
      // Also invalidate events as retention change may have deleted some
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY })
    },
  })
}
