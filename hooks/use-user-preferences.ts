'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface UserPreferences {
  id: string | null
  user_id: string
  name: string | null
  email: string | null
  title: string | null
  company_name: string | null
  country: string | null
  city: string | null
  linkedin_url: string | null
  timezone: string
}

// Form-shaped projection: nullable server fields become empty strings, timezone
// defaults to 'UTC'. Used by every component that binds inputs to user prefs.
export interface UserProfileForm {
  name: string
  email: string
  title: string
  company_name: string
  country: string
  city: string
  linkedin_url: string
  timezone: string
}

export function toProfileForm(p: UserPreferences | undefined | null): UserProfileForm {
  return {
    name:         p?.name         ?? '',
    email:        p?.email        ?? '',
    title:        p?.title        ?? '',
    company_name: p?.company_name ?? '',
    country:      p?.country      ?? '',
    city:         p?.city         ?? '',
    linkedin_url: p?.linkedin_url ?? '',
    timezone:     p?.timezone     ?? 'UTC',
  }
}

const KEY = ['user-preferences'] as const

async function readServerError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({})) as { message?: unknown; error?: unknown }
  return (typeof body.message === 'string' && body.message)
      || (typeof body.error === 'string' && body.error)
      || fallback
}

// Single source of truth for /api/user-preferences. Any number of components
// calling this hook share one in-flight request and one cached result.
export function useUserPreferences(opts?: { enabled?: boolean }) {
  return useQuery<UserPreferences>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/user-preferences')
      if (!res.ok) throw new Error(await readServerError(res, 'Failed to load user preferences'))
      return res.json()
    },
    enabled: opts?.enabled ?? true,
  })
}

export function useUpdateUserPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<UserPreferences>) => {
      const res = await fetch('/api/user-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await readServerError(res, 'Failed to update user preferences'))
      return res.json() as Promise<UserPreferences>
    },
    // Server returns the canonical row; write it into the cache directly so
    // consumers see the post-save state without a follow-up GET.
    onSuccess: (data) => {
      qc.setQueryData<UserPreferences>(KEY, data)
    },
  })
}
