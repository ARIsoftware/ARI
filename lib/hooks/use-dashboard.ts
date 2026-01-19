import { useQuery } from '@tanstack/react-query'

interface FitnessStats {
  averageCompletionsPerDay: number
  mostCompletedTask: { title: string; count: number } | null
  leastCompletedTask: { title: string; count: number } | null
  totalCompletions: number
}

interface Quote {
  id: string
  quote: string
  author?: string | null
}

interface Task {
  id: string
  title: string
  completed: boolean
  created_at: string
  updated_at: string
}

interface Contact {
  id: string
  first_name: string
  last_name: string
  created_at: string
}

interface ActivityItem {
  id: string
  type: 'task_created' | 'task_completed' | 'contact_added'
  title: string
  description: string
  timestamp: string
}

const DEFAULT_FITNESS_STATS: FitnessStats = {
  averageCompletionsPerDay: 0,
  mostCompletedTask: null,
  leastCompletedTask: null,
  totalCompletions: 0,
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
 * Hook to fetch tasks
 */
export function useDashboardTasks(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async (): Promise<Task[]> => {
      const res = await fetch('/api/tasks')
      if (!res.ok) {
        throw new Error('Failed to fetch tasks')
      }
      return res.json()
    },
    enabled,
  })
}

/**
 * Hook to fetch contacts count
 */
export function useDashboardContacts(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const res = await fetch('/api/modules/contacts')
      if (!res.ok) {
        return []
      }
      return res.json()
    },
    enabled,
  })
}

/**
 * Hook to fetch fitness stats
 */
export function useDashboardFitnessStats(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-fitness-stats'],
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
 * Hook to fetch a random quote (fetches all and picks one)
 */
export function useDashboardQuote(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-quote'],
    queryFn: async (): Promise<Quote | null> => {
      const res = await fetch('/api/modules/quotes/quotes')
      if (!res.ok) {
        return null
      }
      const quotes: Quote[] = await res.json()
      if (quotes.length === 0) {
        return null
      }
      // Pick a random quote
      return quotes[Math.floor(Math.random() * quotes.length)]
    },
    enabled,
    staleTime: 60 * 60 * 1000, // Quote stays fresh for 1 hour
  })
}

/**
 * Hook to fetch recent activity for the feed
 */
export function useDashboardRecentActivity(tasksEnabled: boolean, contactsEnabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-recent-activity', tasksEnabled, contactsEnabled],
    queryFn: async (): Promise<ActivityItem[]> => {
      const allActivities: ActivityItem[] = []

      // Fetch tasks if enabled
      if (tasksEnabled) {
        try {
          const tasksRes = await fetch('/api/modules/tasks')
          if (tasksRes.ok) {
            const tasks: Task[] = await tasksRes.json()
            const recentTasks = tasks
              .filter((t) => t.created_at || t.updated_at)
              .sort((a, b) => {
                const dateA = new Date(b.updated_at || b.created_at).getTime()
                const dateB = new Date(a.updated_at || a.created_at).getTime()
                return dateA - dateB
              })
              .slice(0, 10)

            recentTasks.forEach((task) => {
              if (task.completed && task.updated_at !== task.created_at) {
                allActivities.push({
                  id: `task_completed_${task.id}`,
                  type: 'task_completed',
                  title: 'Task Completed',
                  description: task.title,
                  timestamp: task.updated_at,
                })
              }
              allActivities.push({
                id: `task_created_${task.id}`,
                type: 'task_created',
                title: 'Task Created',
                description: task.title,
                timestamp: task.created_at,
              })
            })
          }
        } catch {
          // Silently fail for tasks
        }
      }

      // Fetch contacts if enabled
      if (contactsEnabled) {
        try {
          const contactsRes = await fetch('/api/modules/contacts')
          if (contactsRes.ok) {
            const contacts: Contact[] = await contactsRes.json()
            const recentContacts = contacts
              .filter((c) => c.created_at)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 5)

            recentContacts.forEach((contact) => {
              allActivities.push({
                id: `contact_added_${contact.id}`,
                type: 'contact_added',
                title: 'Contact Added',
                description: `${contact.first_name} ${contact.last_name}`,
                timestamp: contact.created_at,
              })
            })
          }
        } catch {
          // Silently fail for contacts
        }
      }

      // Sort by timestamp and return most recent 15
      return allActivities
        .filter((a) => a.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 15)
    },
    enabled: tasksEnabled || contactsEnabled,
  })
}

/**
 * Combined hook for all Dashboard data
 */
export function useDashboardData() {
  const { data: enabledModules = new Set<string>(), isLoading: modulesLoading } = useEnabledModules()

  const tasksEnabled = enabledModules.has('tasks')
  const contactsEnabled = enabledModules.has('contacts')
  const fitnessEnabled = enabledModules.has('daily-fitness')
  const quotesEnabled = enabledModules.has('quotes')

  const tasksQuery = useDashboardTasks(tasksEnabled)
  const contactsQuery = useDashboardContacts(contactsEnabled)
  const fitnessQuery = useDashboardFitnessStats(fitnessEnabled)
  const quoteQuery = useDashboardQuote(quotesEnabled)
  const activityQuery = useDashboardRecentActivity(tasksEnabled, contactsEnabled)

  return {
    // Module availability
    enabledModules,
    tasksEnabled,
    contactsEnabled,
    fitnessEnabled,
    quotesEnabled,

    // Data
    tasks: tasksQuery.data ?? [],
    taskCount: tasksQuery.data?.length ?? 0,
    contacts: contactsQuery.data ?? [],
    contactCount: contactsQuery.data?.length ?? 0,
    fitnessStats: fitnessQuery.data ?? DEFAULT_FITNESS_STATS,
    quote: quoteQuery.data,
    recentActivity: activityQuery.data ?? [],

    // Loading states
    isLoading: modulesLoading,
    isDataLoading: tasksQuery.isLoading || contactsQuery.isLoading,

    // Errors
    isError: tasksQuery.isError,
  }
}
