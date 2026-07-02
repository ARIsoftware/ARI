'use client'

import { useQuery } from '@tanstack/react-query'
import type { AiProviderId } from '@/lib/ai-providers'

export interface ProviderModel {
  id: string
  label?: string
}

export interface ProviderModelsResponse {
  provider: AiProviderId
  source: 'live' | 'unavailable'
  models: ProviderModel[]
}

const EIGHT_HOURS = 8 * 60 * 60 * 1000

/**
 * Fetch the list of available models for a provider from
 * GET /api/settings/ai-providers/models. The list is provider-wide (not
 * per-module), so the query is keyed by provider id and shared across every
 * AiProviderCard on the page. Cached for 8 hours client-side to match the
 * server-side cache — within that window no refetch happens.
 *
 * Pass `null` to disable the query (e.g. when no provider is selected).
 */
export function useProviderModels(providerId: AiProviderId | null) {
  return useQuery<ProviderModelsResponse>({
    queryKey: ['ai-provider-models', providerId],
    enabled: !!providerId,
    staleTime: EIGHT_HOURS,
    gcTime: EIGHT_HOURS,
    retry: false,
    queryFn: async () => {
      const res = await fetch(
        `/api/settings/ai-providers/models?provider=${encodeURIComponent(providerId!)}`,
      )
      if (!res.ok) {
        // Surface as an empty, unavailable list rather than throwing — the card
        // falls back to free-text entry.
        return { provider: providerId!, source: 'unavailable', models: [] }
      }
      return res.json()
    },
  })
}
