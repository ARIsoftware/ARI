import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ExerciseReminderSettings } from '@/modules/exercise-reminder/types'

const SETTINGS_KEY = ['exercise-reminder-settings']

export function useExerciseReminderSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<Partial<ExerciseReminderSettings>> => {
      const res = await fetch('/api/modules/exercise-reminder/settings')
      if (!res.ok) return {}
      return await res.json()
    },
    staleTime: 30 * 60 * 1000,
  })
}

export function useUpdateExerciseReminderSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<ExerciseReminderSettings>): Promise<void> => {
      const res = await fetch('/api/modules/exercise-reminder/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to save settings')
      }
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<Partial<ExerciseReminderSettings>>(SETTINGS_KEY)
      queryClient.setQueryData<Partial<ExerciseReminderSettings>>(SETTINGS_KEY, (old = {}) => ({
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
