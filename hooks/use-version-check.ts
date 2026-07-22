'use client'

import { useQuery } from '@tanstack/react-query'

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
 * enforces the real cadence (one upstream check per user per 4 days) and
 * stamps the check time, so pass `enabled` only when the popup can actually
 * show (i.e. on /dashboard) — otherwise a background fetch would silently
 * consume the 4-day window.
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
