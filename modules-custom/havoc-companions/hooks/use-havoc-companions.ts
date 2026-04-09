/**
 * Havoc Companions Module — TanStack Query hooks
 *
 * Wraps the /api/modules/havoc-companions/settings endpoint with React
 * Query for cached reads and optimistic writes. Both the global provider
 * and the /havoc-companions page consume these hooks, so the React Query
 * cache is the single source of truth across the entire app.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HavocCompanionSettings } from '@/modules/havoc-companions/types'

export const HAVOC_SETTINGS_KEY = ['havoc-companions-settings'] as const

export function useHavocSettings() {
  return useQuery({
    queryKey: HAVOC_SETTINGS_KEY,
    queryFn: async (): Promise<Partial<HavocCompanionSettings>> => {
      const res = await fetch('/api/modules/havoc-companions/settings')
      // The route returns 200 with `{}` when there's no settings row yet,
      // so only throw on real failures. Swallowing 5xx/auth errors here
      // would cause the bootstrap effect to silently fire unnecessary
      // writes on auth flaps.
      if (!res.ok) {
        throw new Error(`Failed to load havoc-companions settings (${res.status})`)
      }
      return await res.json()
    },
    // Settings change rarely and the optimistic onMutate keeps the cache
    // fresh on writes — no need to refetch on focus / mount.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export function useUpdateHavocSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<HavocCompanionSettings>): Promise<void> => {
      const res = await fetch('/api/modules/havoc-companions/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = Array.isArray(err?.details)
          ? err.details
              .map((d: { message?: string }) => d.message)
              .filter(Boolean)
              .join(', ')
          : ''
        throw new Error(details || err?.error || 'Failed to save settings')
      }
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: HAVOC_SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<HavocCompanionSettings>>(
        HAVOC_SETTINGS_KEY,
      )
      queryClient.setQueryData<Partial<HavocCompanionSettings>>(
        HAVOC_SETTINGS_KEY,
        (old = {}) => ({ ...old, ...newSettings }),
      )
      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      // Roll back the optimistic update — and force a refetch since the
      // server may now hold a state we didn't predict.
      if (context?.previous) {
        queryClient.setQueryData(HAVOC_SETTINGS_KEY, context.previous)
      }
      queryClient.invalidateQueries({ queryKey: HAVOC_SETTINGS_KEY })
    },
  })
}
