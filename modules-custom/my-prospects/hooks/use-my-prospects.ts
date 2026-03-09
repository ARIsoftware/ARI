import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Prospect, CreateProspectRequest, UpdateProspectRequest, ProspectSettings } from '../types'

const PROSPECTS_KEY = ['my-prospects']
const SETTINGS_KEY = ['my-prospects-settings']

export function useProspects() {
  return useQuery({
    queryKey: PROSPECTS_KEY,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<Prospect[]> => {
      const res = await fetch('/api/modules/my-prospects/data')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch prospects')
      }
      const data = await res.json()
      return data.prospects || []
    },
  })
}

export function useCreateProspect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateProspectRequest): Promise<Prospect> => {
      const res = await fetch('/api/modules/my-prospects/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: { message: string }) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to create prospect')
      }
      const json = await res.json()
      return json.prospect
    },
    onMutate: async (newProspect) => {
      await queryClient.cancelQueries({ queryKey: PROSPECTS_KEY })
      const previous = queryClient.getQueryData<Prospect[]>(PROSPECTS_KEY)

      queryClient.setQueryData<Prospect[]>(PROSPECTS_KEY, (old = []) => [
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          name: newProspect.name,
          position: newProspect.position,
          graduation_year: newProspect.graduation_year,
          school: newProspect.school,
          height: newProspect.height,
          rating: newProspect.rating,
          notes: newProspect.notes || null,
          evaluated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...old,
      ])

      return { previous }
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROSPECTS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROSPECTS_KEY })
    },
  })
}

export function useUpdateProspect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateProspectRequest & { id: string }): Promise<Prospect> => {
      const res = await fetch(`/api/modules/my-prospects/data?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: { message: string }) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to update prospect')
      }
      const json = await res.json()
      return json.prospect
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: PROSPECTS_KEY })
      const previous = queryClient.getQueryData<Prospect[]>(PROSPECTS_KEY)

      queryClient.setQueryData<Prospect[]>(PROSPECTS_KEY, (old = []) =>
        old.map((p) =>
          p.id === id
            ? { ...p, ...updates, evaluated_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            : p
        )
      )

      return { previous }
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROSPECTS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROSPECTS_KEY })
    },
  })
}

export function useDeleteProspect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/my-prospects/data?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete prospect')
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: PROSPECTS_KEY })
      const previous = queryClient.getQueryData<Prospect[]>(PROSPECTS_KEY)

      queryClient.setQueryData<Prospect[]>(PROSPECTS_KEY, (old = []) =>
        old.filter((p) => p.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROSPECTS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROSPECTS_KEY })
    },
  })
}

export function useProspectSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<Partial<ProspectSettings>> => {
      const res = await fetch('/api/modules/my-prospects/settings')
      if (!res.ok) return {}
      return await res.json()
    },
  })
}

export function useUpdateProspectSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<ProspectSettings>): Promise<void> => {
      const res = await fetch('/api/modules/my-prospects/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save settings')
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<ProspectSettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<ProspectSettings>>(SETTINGS_KEY, (old = {}) => ({
        ...old,
        ...newSettings,
      }))
      return { previous }
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SETTINGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
