'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type VersionCheckResult = {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
}

const QUERY_KEY = ['version-check'] as const

const NO_UPDATE: VersionCheckResult = {
  updateAvailable: false,
  currentVersion: '',
  latestVersion: null,
}

/**
 * Asks the server whether a newer ARI version is available. The server
 * enforces the real cadence (one upstream check per user per 4 days, answered
 * from the stored result in between) and keeps reporting the update until the
 * user ignores it. Pass `enabled` only when the popup can actually show
 * (i.e. on /dashboard).
 */
export function useVersionCheck(enabled: boolean) {
  return useQuery<VersionCheckResult>({
    queryKey: QUERY_KEY,
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch('/api/version-check')
      if (!res.ok) return NO_UPDATE
      return res.json()
    },
  })
}

/**
 * Records that the user clicked Ignore: the server stays silent for 4 days.
 * The cached result is cleared optimistically so the popup closes at once; a
 * failed save only means the notice returns on the next full load.
 */
export function useIgnoreVersionNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/version-check', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to ignore update notice')
    },
    onMutate: () => {
      queryClient.setQueryData<VersionCheckResult>(QUERY_KEY, (prev) => ({
        ...(prev ?? NO_UPDATE),
        updateAvailable: false,
      }))
    },
  })
}
