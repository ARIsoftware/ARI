"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface LoginBranding {
  hasLogo: boolean
  contentType: string | null
  filename: string | null
  updatedAt: string | null
}

const BRANDING_KEY = ['settings', 'branding'] as const

/** Current login-screen logo metadata (admin only). */
export function useLoginBranding() {
  return useQuery<LoginBranding>({
    queryKey: BRANDING_KEY,
    queryFn: async () => {
      const res = await fetch('/api/settings/branding')
      if (!res.ok) throw new Error('Failed to load login branding')
      return res.json()
    },
  })
}

/** Upload or replace the login logo. */
export function useUploadLoginLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File): Promise<LoginBranding> => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/settings/branding', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to upload logo')
      return data as LoginBranding
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDING_KEY }),
  })
}

/** Remove the login logo and revert to the default login screen. */
export function useDeleteLoginLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<LoginBranding> => {
      const res = await fetch('/api/settings/branding', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to remove logo')
      return data as LoginBranding
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDING_KEY }),
  })
}
