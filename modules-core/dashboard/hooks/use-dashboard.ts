import { useQuery } from '@tanstack/react-query'
import type { ActivityItem } from '../types'

interface Quote {
  id: string
  quote: string
  author?: string | null
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
        console.warn('useEnabledModules: failed to fetch enabled modules', res.status)
        return new Set()
      }
      const data = await res.json()
      return new Set(data.modules.map((m: { id: string }) => m.id))
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Hook to check if Tasks module is enabled (required dependency)
 */
export function useTasksModuleEnabled() {
  const { data: enabledModules, isLoading } = useEnabledModules()
  return {
    isEnabled: enabledModules?.has('tasks') ?? false,
    isLoading,
  }
}

/**
 * Hook to fetch a random quote. Server picks the row via ORDER BY random() LIMIT 1
 * so the client only receives one quote instead of the whole table.
 */
export function useDashboardQuote(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-quote'],
    queryFn: async (): Promise<Quote | null> => {
      const res = await fetch('/api/modules/quotes/quotes/random')
      if (!res.ok) return null
      return res.json()
    },
    enabled,
    staleTime: 60 * 60 * 1000, // Quote stays fresh for 1 hour
  })
}

/**
 * Hook to fetch recent activity for the feed. Server returns at most 15
 * ActivityItems pre-sorted by timestamp DESC; the client passes the array
 * straight to the widget.
 */
export function useDashboardRecentActivity(tasksEnabled: boolean, contactsEnabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-recent-activity', tasksEnabled, contactsEnabled],
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!tasksEnabled && !contactsEnabled) return []
      const res = await fetch('/api/modules/dashboard/recent-activity')
      if (!res.ok) {
        console.warn('Dashboard recent activity: fetch failed', res.status)
        return []
      }
      return res.json()
    },
    enabled: tasksEnabled || contactsEnabled,
  })
}

/**
 * Combined hook for all Dashboard data
 * Module-specific data (tasks, contacts, fitness) is now fetched by each module's own widget components.
 */
export function useDashboardData() {
  const { data: enabledModules = new Set<string>(), isLoading: modulesLoading } = useEnabledModules()

  const tasksEnabled = enabledModules.has('tasks')
  const contactsEnabled = enabledModules.has('contacts')
  const quotesEnabled = enabledModules.has('quotes')

  const quoteQuery = useDashboardQuote(quotesEnabled)
  const activityQuery = useDashboardRecentActivity(tasksEnabled, contactsEnabled)

  return {
    // Module availability
    enabledModules,
    tasksEnabled,
    contactsEnabled,
    quotesEnabled,

    // Data
    quote: quoteQuery.data,
    recentActivity: activityQuery.data ?? [],

    // Loading states
    isLoading: modulesLoading,
    isDataLoading: activityQuery.isLoading,
  }
}
