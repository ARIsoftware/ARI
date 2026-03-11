import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AriLaunchEntry } from '../types'

// Input types for mutations
export type CreateEntryInput = {
  day_number: number
  title: string
}

export type UpdateEntryInput = {
  id: string
  day_number?: number
  title?: string
  order_index?: number
  completed?: boolean
}

/**
 * Fetch all entries for the current user.
 * Entries are ordered by day_number and order_index.
 */
export function useAriLaunchEntries() {
  return useQuery({
    queryKey: ['ari-launch-entries'],
    queryFn: async (): Promise<AriLaunchEntry[]> => {
      const res = await fetch('/api/modules/ari-launch/data')
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
 * Create a new entry with optimistic updates.
 */
export function useCreateAriLaunchEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEntryInput): Promise<AriLaunchEntry> => {
      const res = await fetch('/api/modules/ari-launch/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create entry')
      }
      const data = await res.json()
      return data.entry
    },
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: ['ari-launch-entries'] })
      const previous = queryClient.getQueryData<AriLaunchEntry[]>(['ari-launch-entries'])

      queryClient.setQueryData<AriLaunchEntry[]>(['ari-launch-entries'], (old = []) => {
        // Find max order_index for this day to place new task at bottom
        const dayEntries = old.filter(e => e.day_number === newEntry.day_number)
        const maxOrderIndex = dayEntries.length > 0
          ? Math.max(...dayEntries.map(e => e.order_index ?? 0))
          : -1

        return [
          ...old,
          {
            ...newEntry,
            id: 'temp-' + Date.now(),
            user_id: '',
            order_index: maxOrderIndex + 1,
            completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as AriLaunchEntry,
        ]
      })

      return { previous }
    },
    onError: (_err, _newEntry, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['ari-launch-entries'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ari-launch-entries'] })
    },
  })
}

/**
 * Update an entry with optimistic updates.
 * Used for editing title or moving to a different day.
 */
export function useUpdateAriLaunchEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateEntryInput): Promise<AriLaunchEntry> => {
      const res = await fetch('/api/modules/ari-launch/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update entry')
      }
      const data = await res.json()
      return data.entry
    },
    onMutate: async (updatedEntry) => {
      await queryClient.cancelQueries({ queryKey: ['ari-launch-entries'] })
      const previous = queryClient.getQueryData<AriLaunchEntry[]>(['ari-launch-entries'])

      queryClient.setQueryData<AriLaunchEntry[]>(['ari-launch-entries'], (old = []) =>
        old.map(e => e.id === updatedEntry.id
          ? { ...e, ...updatedEntry, updated_at: new Date().toISOString() }
          : e
        )
      )

      return { previous }
    },
    onError: (_err, _updatedEntry, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['ari-launch-entries'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ari-launch-entries'] })
    },
  })
}

/**
 * Delete an entry with optimistic updates.
 */
export function useDeleteAriLaunchEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/ari-launch/data?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete entry')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['ari-launch-entries'] })
      const previous = queryClient.getQueryData<AriLaunchEntry[]>(['ari-launch-entries'])

      queryClient.setQueryData<AriLaunchEntry[]>(['ari-launch-entries'], (old = []) =>
        old.filter(e => e.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['ari-launch-entries'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ari-launch-entries'] })
    },
  })
}
