'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'

export type KeyStatus = { configured: boolean; masked: string | null }

export type ApiKeysStatus = Record<string, KeyStatus>

const QUERY_KEY = ['settings', 'api-keys'] as const

export function useApiKeysStatus() {
  return useQuery<ApiKeysStatus>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys')
      if (!res.ok) return {}
      return res.json()
    },
  })
}

/**
 * Lets callers (e.g. the Save handler in IntegrationsTab) patch the cached
 * status after a write, so the UI updates without a refetch round-trip.
 */
export function useUpdateApiKeysStatusCache() {
  const queryClient = useQueryClient()
  return (updates: ApiKeysStatus) => {
    queryClient.setQueryData<ApiKeysStatus>(QUERY_KEY, (prev) => ({
      ...(prev ?? {}),
      ...updates,
    }))
  }
}
