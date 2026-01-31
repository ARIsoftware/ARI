import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FitnessTask } from '../lib/fitness'

/**
 * Fetch all fitness tasks for the current user.
 */
export function useFitnessTasks() {
  return useQuery({
    queryKey: ['fitness-tasks'],
    queryFn: async (): Promise<FitnessTask[]> => {
      const res = await fetch('/api/modules/daily-fitness', { credentials: 'include' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch fitness tasks')
      }
      return res.json()
    },
  })
}

/**
 * Hook to invalidate fitness tasks cache - call after mutations
 */
export function useInvalidateFitnessTasks() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['fitness-tasks'] })
}

/**
 * Hook to update fitness tasks cache optimistically
 */
export function useSetFitnessTasksCache() {
  const queryClient = useQueryClient()
  return (updater: (tasks: FitnessTask[]) => FitnessTask[]) => {
    queryClient.setQueryData<FitnessTask[]>(['fitness-tasks'], (old = []) => updater(old))
  }
}
