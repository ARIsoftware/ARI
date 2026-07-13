'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PermissionMap, UserRole } from '@/lib/permissions'

export interface AdminUser {
  id: string
  email: string
  name: string | null
  first_name: string | null
  last_name: string | null
  image: string | null
  role: UserRole
  /** Effective permissions — admins always resolve to all true. */
  permissions: PermissionMap
  disabled: boolean
  two_factor_enabled: boolean | null
  created_at: string | null
  updated_at: string | null
}

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

export interface CreateUserInput {
  email: string
  password: string
  firstName?: string
  lastName?: string
  role: UserRole
}

export interface UpdateUserInput {
  id: string
  email?: string
  firstName?: string | null
  lastName?: string | null
  password?: string
  role?: UserRole
  permissions?: Partial<PermissionMap>
  disabled?: boolean
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
 * Used for gating UI (sidebar Users link, permission toggles) — the session
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

export function useUsers(opts?: { enabled?: boolean }) {
  return useQuery<AdminUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users')
      return parseJsonOrThrow<AdminUser[]>(res, 'Failed to load users')
    },
    enabled: opts?.enabled ?? true,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return parseJsonOrThrow<AdminUser>(res, 'Failed to create user')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateUserInput) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      return parseJsonOrThrow<AdminUser>(res, 'Failed to update user')
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminUser[]>(['users'], (prev) =>
        prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev
      )
      // Self-edits can change our own grants — refresh the gate data too.
      queryClient.invalidateQueries({ queryKey: ['current-user'] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      return parseJsonOrThrow<{ success: true }>(res, 'Failed to delete user')
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<AdminUser[]>(['users'], (prev) =>
        prev ? prev.filter((u) => u.id !== id) : prev
      )
    },
  })
}
