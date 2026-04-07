/**
 * Module Template Module - TanStack Query Hooks
 *
 * This file provides data fetching hooks for the module-template module.
 * Uses TanStack Query for:
 * - Automatic caching and deduplication
 * - Optimistic updates for instant UI feedback
 * - Background refetching
 * - Error handling
 *
 * Usage:
 *   import { useModuleTemplateEntries, useCreateModuleTemplateEntry } from '@/modules/module-template/hooks/use-module-template'
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ModuleTemplateEntry, ModuleTemplateSettings } from '../types'

// Query keys
const ENTRIES_KEY = ['module-template-entries']
const SETTINGS_KEY = ['module-template-settings']

/**
 * Fetch all entries for the current user
 */
export function useModuleTemplateEntries() {
  return useQuery({
    queryKey: ENTRIES_KEY,
    queryFn: async (): Promise<ModuleTemplateEntry[]> => {
      const res = await fetch('/api/modules/module-template/data')
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
export function useCreateModuleTemplateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (message: string): Promise<ModuleTemplateEntry> => {
      const res = await fetch('/api/modules/module-template/data', {
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
      const previous = queryClient.getQueryData<ModuleTemplateEntry[]>(ENTRIES_KEY)

      queryClient.setQueryData<ModuleTemplateEntry[]>(ENTRIES_KEY, (old = []) => [
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          message: newMessage,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as ModuleTemplateEntry,
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
export function useDeleteModuleTemplateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/module-template/data?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete entry')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ENTRIES_KEY })
      const previous = queryClient.getQueryData<ModuleTemplateEntry[]>(ENTRIES_KEY)

      queryClient.setQueryData<ModuleTemplateEntry[]>(ENTRIES_KEY, (old = []) =>
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
export function useModuleTemplateSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<ModuleTemplateSettings>> => {
      const res = await fetch('/api/modules/module-template/settings')
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
export function useUpdateModuleTemplateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<ModuleTemplateSettings>): Promise<void> => {
      const res = await fetch('/api/modules/module-template/settings', {
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
      const previous = queryClient.getQueryData<Partial<ModuleTemplateSettings>>(SETTINGS_KEY)

      queryClient.setQueryData<Partial<ModuleTemplateSettings>>(SETTINGS_KEY, (old = {}) => ({
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
