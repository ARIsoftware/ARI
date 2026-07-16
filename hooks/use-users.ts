'use client'

import { useQuery } from '@tanstack/react-query'
import type { PermissionMap, UserRole } from '@/lib/permissions'

// The admin user-management hooks (list/create/update/delete) live in the
// Users module (@/modules/users/hooks/use-users-admin) — only the
// current-account hook stays in core, because the sidebar, command palette
// and Settings gate on it even without that module installed.

export interface CurrentUser {
  id: string
  email: string
  name: string | null
  first_name: string | null
  last_name: string | null
  image: string | null
  role: UserRole
  permissions: PermissionMap
}

async function parseJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((body as { error?: string } | null)?.error || fallbackMessage)
  }
  return body as T
}

/**
 * Current account with role + effective permissions, fresh from the DB row.
 * Used for gating UI (sidebar Settings link, permission toggles) — the session
 * payload is cookie-cached for 5 minutes and can be stale.
 */
export function useCurrentUser(opts?: { enabled?: boolean }) {
  return useQuery<CurrentUser>({
    queryKey: ['current-user'],
    queryFn: async () => {
      const res = await fetch('/api/users/me')
      return parseJsonOrThrow<CurrentUser>(res, 'Failed to load current user')
    },
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  })
}
