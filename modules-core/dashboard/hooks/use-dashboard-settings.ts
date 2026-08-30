import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashboardSettings } from '@/modules/dashboard/types'

const SETTINGS_KEY = ['dashboard-settings']

export function useDashboardSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<DashboardSettings>> => {
      const res = await fetch('/api/modules/dashboard/settings')
      if (!res.ok) return {}
      return await res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateDashboardSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<DashboardSettings>): Promise<void> => {
      const res = await fetch('/api/modules/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details
          ?.map((d: { message?: string }) => d.message)
          .filter(Boolean)
          .join(', ')
        throw new Error(details || err.error || 'Failed to save settings')
      }
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<DashboardSettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<DashboardSettings>>(SETTINGS_KEY, (old = {}) => ({
        ...old,
        ...newSettings,
      }))
      return { previous }
    },
    onError: (_err, _newSettings, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SETTINGS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}
