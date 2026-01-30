/**
 * Hello World Module - TanStack Query Hooks
 *
 * This file provides data fetching hooks for the hello-world module.
 * Uses TanStack Query for:
 * - Automatic caching and deduplication
 * - Optimistic updates for instant UI feedback
 * - Background refetching
 * - Error handling
 *
 * Usage:
 *   import { useHelloWorldEntries, useCreateHelloWorldEntry } from '@/lib/hooks/use-hello-world'
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { HelloWorldEntry, HelloWorldSettings } from '@/modules/hello-world/types'

// Query keys
const ENTRIES_KEY = ['hello-world-entries']
const SETTINGS_KEY = ['hello-world-settings']

/**
 * Fetch all entries for the current user
 */
export function useHelloWorldEntries() {
  return useQuery({
    queryKey: ENTRIES_KEY,
    queryFn: async (): Promise<HelloWorldEntry[]> => {
      const res = await fetch('/api/modules/hello-world/data')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch entries')
      }
      const data = await res.json()
      return data.entries || []
    },
  })
}

/**
 * Create a new entry with optimistic updates
 */
export function useCreateHelloWorldEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (message: string): Promise<HelloWorldEntry> => {
      const res = await fetch('/api/modules/hello-world/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create entry')
      }
      const data = await res.json()
      return data.entry
    },
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ENTRIES_KEY })
      const previous = queryClient.getQueryData<HelloWorldEntry[]>(ENTRIES_KEY)

      queryClient.setQueryData<HelloWorldEntry[]>(ENTRIES_KEY, (old = []) => [
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          message: newMessage,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as HelloWorldEntry,
        ...old,
      ])

      return { previous }
    },
    onError: (_err, _newMessage, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ENTRIES_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_KEY })
    },
  })
}

/**
 * Delete an entry with optimistic updates
 */
export function useDeleteHelloWorldEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/hello-world/data?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete entry')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ENTRIES_KEY })
      const previous = queryClient.getQueryData<HelloWorldEntry[]>(ENTRIES_KEY)

      queryClient.setQueryData<HelloWorldEntry[]>(ENTRIES_KEY, (old = []) =>
        old.filter(e => e.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ENTRIES_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_KEY })
    },
  })
}

/**
 * Fetch module settings
 */
export function useHelloWorldSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<HelloWorldSettings>> => {
      const res = await fetch('/api/modules/hello-world/settings')
      if (!res.ok) {
        // Return empty object if no settings exist yet
        return {}
      }
      return await res.json()
    },
  })
}

/**
 * Update module settings
 */
export function useUpdateHelloWorldSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<HelloWorldSettings>): Promise<void> => {
      const res = await fetch('/api/modules/hello-world/settings', {
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
      const previous = queryClient.getQueryData<Partial<HelloWorldSettings>>(SETTINGS_KEY)

      queryClient.setQueryData<Partial<HelloWorldSettings>>(SETTINGS_KEY, (old = {}) => ({
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
    },
  })
}
