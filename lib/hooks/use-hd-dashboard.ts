import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'

interface WinterArcGoal {
  id: string
  user_id: string
  title: string
  completed: boolean
  created_at: string
  updated_at: string
}

interface Task {
  id: string
  title: string
  status: string
  priority_score?: number
  due_date?: string
  impact?: number
  severity?: number
  timeliness?: number
  effort?: number
  strategic_fit?: number
  pinned?: boolean
  completed: boolean
}

interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

interface NotepadData {
  content: string
}

const DEFAULT_FITNESS_STATS: FitnessStats = {
  averageCompletionsPerDay: 0,
  mostCompletedTask: null,
  leastCompletedTask: null,
  totalCompletions: 0
}

/**
 * Hook to fetch enabled modules
 */
export function useEnabledModules() {
  return useQuery({
    queryKey: ['enabled-modules'],
    queryFn: async (): Promise<Set<string>> => {
      const res = await fetch('/api/modules/enabled')
      if (!res.ok) {
        // Fallback to empty set if modules API fails
        return new Set()
      }
      const data = await res.json()
      return new Set(data.modules.map((m: { id: string }) => m.id))
    },
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
  })
}

/**
 * Hook to fetch tasks for HD Dashboard
 */
export function useHDDashboardTasks() {
  return useQuery({
    queryKey: ['hd-dashboard-tasks'],
    queryFn: async (): Promise<Task[]> => {
      const res = await fetch('/api/tasks')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch tasks')
      }
      return res.json()
    },
  })
}

/**
 * Hook to fetch notepad content
 */
export function useHDDashboardNotepad() {
  return useQuery({
    queryKey: ['hd-dashboard-notepad'],
    queryFn: async (): Promise<NotepadData> => {
      const res = await fetch('/api/notepad')
      if (!res.ok) {
        return { content: '' }
      }
      return res.json()
    },
  })
}

/**
 * Hook to fetch fitness stats (conditional based on module enabled)
 */
export function useHDDashboardFitnessStats(enabled: boolean) {
  return useQuery({
    queryKey: ['hd-dashboard-fitness'],
    queryFn: async (): Promise<FitnessStats> => {
      const res = await fetch('/api/fitness-stats')
      if (!res.ok) {
        return DEFAULT_FITNESS_STATS
      }
      return res.json()
    },
    enabled,
  })
}

/**
 * Hook to fetch Winter Arc goals (conditional based on module enabled)
 */
export function useHDDashboardWinterArcGoals(enabled: boolean) {
  return useQuery({
    queryKey: ['hd-dashboard-winter-arc'],
    queryFn: async (): Promise<WinterArcGoal[]> => {
      const res = await fetch('/api/modules/winter-arc')
      if (!res.ok) {
        return []
      }
      return res.json()
    },
    enabled,
  })
}

/**
 * Hook to toggle a Winter Arc goal
 */
export function useToggleWinterArcGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }): Promise<WinterArcGoal> => {
      const res = await fetch(`/api/modules/winter-arc/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to toggle goal')
      }
      return res.json()
    },
    onSuccess: (updatedGoal) => {
      // Update the cache with the new goal state
      queryClient.setQueryData<WinterArcGoal[]>(['hd-dashboard-winter-arc'], (oldGoals = []) =>
        oldGoals.map(g => g.id === updatedGoal.id ? updatedGoal : g)
      )
    },
  })
}

/**
 * Combined hook for all HD Dashboard data
 */
export function useHDDashboardData() {
  const { data: enabledModules = new Set<string>(), isLoading: modulesLoading } = useEnabledModules()

  const tasksQuery = useHDDashboardTasks()
  const notepadQuery = useHDDashboardNotepad()
  const fitnessQuery = useHDDashboardFitnessStats(enabledModules.has('daily-fitness'))
  const winterArcQuery = useHDDashboardWinterArcGoals(enabledModules.has('winter-arc'))

  return {
    enabledModules,
    tasks: tasksQuery.data ?? [],
    notepadContent: notepadQuery.data?.content ?? '',
    fitnessStats: fitnessQuery.data ?? DEFAULT_FITNESS_STATS,
    winterArcGoals: winterArcQuery.data ?? [],
    isLoading: modulesLoading || tasksQuery.isLoading || notepadQuery.isLoading,
    isError: tasksQuery.isError || notepadQuery.isError,
  }
}
