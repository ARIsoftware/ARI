import { useQuery } from '@tanstack/react-query'

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
  name: string
  created_at: string
}

interface ActivityItem {
  id: string
  type: 'task_created' | 'task_completed' | 'contact_added'
  title: string
  description: string
  timestamp: string
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
      if (!Array.isArray(quotes) || quotes.length === 0) {
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
        } catch (err) {
          console.warn('Dashboard recent activity: failed to fetch tasks', err)
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
                description: contact.name,
                timestamp: contact.created_at,
              })
            })
          }
        } catch (err) {
          console.warn('Dashboard recent activity: failed to fetch contacts', err)
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
