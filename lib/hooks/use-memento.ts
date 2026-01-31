/**
 * Memento Module - TanStack Query Hooks
 *
 * Provides hooks for settings, milestones, and eras with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  MementoSettings,
  MementoMilestone,
  MementoEra,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  CreateEraRequest,
  UpdateEraRequest
} from '@/modules/memento/types'

// ============================================
// Settings Hooks
// ============================================

/**
 * Fetch user's memento settings
 */
export function useMementoSettings() {
  return useQuery({
    queryKey: ['memento-settings'],
    queryFn: async (): Promise<MementoSettings | null> => {
      const res = await fetch('/api/modules/memento/settings')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch settings')
      }
      const data = await res.json()
      return data.settings
    },
  })
}

/**
 * Save memento settings (create or update)
 */
export function useSaveMementoSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { birthdate: string; target_lifespan?: number }): Promise<MementoSettings> => {
      const res = await fetch('/api/modules/memento/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save settings')
      }
      const data = await res.json()
      return data.settings
    },
    onSuccess: (newSettings) => {
      queryClient.setQueryData(['memento-settings'], newSettings)
    },
  })
}

// ============================================
// Milestones Hooks
// ============================================

/**
 * Fetch all milestones for the user
 */
export function useMementoMilestones() {
  return useQuery({
    queryKey: ['memento-milestones'],
    queryFn: async (): Promise<MementoMilestone[]> => {
      const res = await fetch('/api/modules/memento/milestones')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch milestones')
      }
      const data = await res.json()
      return data.milestones || []
    },
  })
}

/**
 * Create or update a milestone with optimistic updates
 */
export function useCreateMementoMilestone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateMilestoneRequest): Promise<MementoMilestone> => {
      const res = await fetch('/api/modules/memento/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save milestone')
      }
      const data = await res.json()
      return data.milestone
    },
    onMutate: async (newMilestone) => {
      await queryClient.cancelQueries({ queryKey: ['memento-milestones'] })
      const previous = queryClient.getQueryData<MementoMilestone[]>(['memento-milestones'])

      queryClient.setQueryData<MementoMilestone[]>(['memento-milestones'], (old = []) => {
        // Remove existing milestone for this week if any
        const filtered = old.filter(m => m.week_number !== newMilestone.week_number)
        return [
          ...filtered,
          {
            ...newMilestone,
            id: 'temp-' + Date.now(),
            user_id: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as MementoMilestone,
        ]
      })

      return { previous }
    },
    onError: (_err, _newMilestone, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['memento-milestones'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['memento-milestones'] })
    },
  })
}

/**
 * Update a milestone
 */
export function useUpdateMementoMilestone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateMilestoneRequest & { id: string }): Promise<MementoMilestone> => {
      const res = await fetch('/api/modules/memento/milestones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update milestone')
      }
      const data = await res.json()
      return data.milestone
    },
    onMutate: async (updatedMilestone) => {
      await queryClient.cancelQueries({ queryKey: ['memento-milestones'] })
      const previous = queryClient.getQueryData<MementoMilestone[]>(['memento-milestones'])

      queryClient.setQueryData<MementoMilestone[]>(['memento-milestones'], (old = []) =>
        old.map(m => m.id === updatedMilestone.id
          ? { ...m, ...updatedMilestone, updated_at: new Date().toISOString() }
          : m
        )
      )

      return { previous }
    },
    onError: (_err, _updatedMilestone, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['memento-milestones'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['memento-milestones'] })
    },
  })
}

/**
 * Delete a milestone
 */
export function useDeleteMementoMilestone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/memento/milestones?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete milestone')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['memento-milestones'] })
      const previous = queryClient.getQueryData<MementoMilestone[]>(['memento-milestones'])

      queryClient.setQueryData<MementoMilestone[]>(['memento-milestones'], (old = []) =>
        old.filter(m => m.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['memento-milestones'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['memento-milestones'] })
    },
  })
}

// ============================================
// Eras Hooks
// ============================================

/**
 * Fetch all eras for the user
 */
export function useMementoEras() {
  return useQuery({
    queryKey: ['memento-eras'],
    queryFn: async (): Promise<MementoEra[]> => {
      const res = await fetch('/api/modules/memento/eras')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch eras')
      }
      const data = await res.json()
      return data.eras || []
    },
  })
}

/**
 * Create a new era
 */
export function useCreateMementoEra() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEraRequest): Promise<MementoEra> => {
      const res = await fetch('/api/modules/memento/eras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create era')
      }
      const data = await res.json()
      return data.era
    },
    onMutate: async (newEra) => {
      await queryClient.cancelQueries({ queryKey: ['memento-eras'] })
      const previous = queryClient.getQueryData<MementoEra[]>(['memento-eras'])

      queryClient.setQueryData<MementoEra[]>(['memento-eras'], (old = []) => [
        ...old,
        {
          ...newEra,
          id: 'temp-' + Date.now(),
          user_id: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as MementoEra,
      ])

      return { previous }
    },
    onError: (_err, _newEra, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['memento-eras'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['memento-eras'] })
    },
  })
}

/**
 * Update an era
 */
export function useUpdateMementoEra() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateEraRequest & { id: string }): Promise<MementoEra> => {
      const res = await fetch('/api/modules/memento/eras', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update era')
      }
      const data = await res.json()
      return data.era
    },
    onMutate: async (updatedEra) => {
      await queryClient.cancelQueries({ queryKey: ['memento-eras'] })
      const previous = queryClient.getQueryData<MementoEra[]>(['memento-eras'])

      queryClient.setQueryData<MementoEra[]>(['memento-eras'], (old = []) =>
        old.map(e => e.id === updatedEra.id
          ? { ...e, ...updatedEra, updated_at: new Date().toISOString() }
          : e
        )
      )

      return { previous }
    },
    onError: (_err, _updatedEra, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['memento-eras'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['memento-eras'] })
    },
  })
}

/**
 * Delete an era
 */
export function useDeleteMementoEra() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/memento/eras?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete era')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['memento-eras'] })
      const previous = queryClient.getQueryData<MementoEra[]>(['memento-eras'])

      queryClient.setQueryData<MementoEra[]>(['memento-eras'], (old = []) =>
        old.filter(e => e.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['memento-eras'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['memento-eras'] })
    },
  })
}
