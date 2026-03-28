import { useQuery } from '@tanstack/react-query'

interface Task {
  id: string
  title: string
  status: string
  completed: boolean
  due_date: string | null
  priority_score: number | null
  impact: number | null
  severity: number | null
  effort: number | null
  timeliness: number | null
  strategic_fit: number | null
  pinned: boolean
  created_at: string
  updated_at: string
  completion_count: number
}

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

interface NorthstarGoal {
  id: string
  title: string
  description: string | null
  category: string | null
  priority: string
  progress: number
  deadline: string | null
}

const DEFAULT_FITNESS_STATS: FitnessStats = {
  averageCompletionsPerDay: 0,
  mostCompletedTask: null,
  leastCompletedTask: null,
  totalCompletions: 0,
}

function useFlashEnabledModules() {
  return useQuery({
    queryKey: ['enabled-modules'],
    queryFn: async (): Promise<Set<string>> => {
      const res = await fetch('/api/modules/enabled')
      if (!res.ok) return new Set()
      const data = await res.json()
      return new Set(data.modules.map((m: { id: string }) => m.id))
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useFlashTasks(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-flash-tasks'],
    queryFn: async (): Promise<Task[]> => {
      const res = await fetch('/api/tasks')
      if (!res.ok) return []
      return res.json()
    },
    enabled,
  })
}

function useFlashContacts(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-flash-contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const res = await fetch('/api/modules/contacts')
      if (!res.ok) return []
      return res.json()
    },
    enabled,
  })
}

function useFlashFitnessStats(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-flash-fitness'],
    queryFn: async (): Promise<FitnessStats> => {
      const res = await fetch('/api/fitness-stats')
      if (!res.ok) return DEFAULT_FITNESS_STATS
      return res.json()
    },
    enabled,
  })
}

function useFlashQuote(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-flash-quote'],
    queryFn: async (): Promise<Quote | null> => {
      const res = await fetch('/api/modules/quotes/quotes')
      if (!res.ok) return null
      const quotes: Quote[] = await res.json()
      if (quotes.length === 0) return null
      return quotes[Math.floor(Math.random() * quotes.length)]
    },
    enabled,
    staleTime: 60 * 60 * 1000,
  })
}

function useFlashNotepad(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-flash-notepad'],
    queryFn: async (): Promise<string> => {
      const res = await fetch('/api/notepad')
      if (!res.ok) return ''
      const data = await res.json()
      return data.content ?? ''
    },
    enabled,
  })
}

function useFlashNorthstarGoals(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-flash-northstar'],
    queryFn: async (): Promise<NorthstarGoal[]> => {
      const res = await fetch('/api/modules/northstar/goals')
      if (!res.ok) return []
      return res.json()
    },
    enabled,
  })
}

function useFlashRecentActivity(tasksEnabled: boolean, contactsEnabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-flash-activity', tasksEnabled, contactsEnabled],
    queryFn: async (): Promise<ActivityItem[]> => {
      const allActivities: ActivityItem[] = []

      if (tasksEnabled) {
        try {
          const res = await fetch('/api/modules/tasks')
          if (res.ok) {
            const tasks: Task[] = await res.json()
            tasks
              .filter((t) => t.created_at || t.updated_at)
              .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
              .slice(0, 10)
              .forEach((task) => {
                if (task.completed && task.updated_at !== task.created_at) {
                  allActivities.push({
                    id: `completed_${task.id}`,
                    type: 'task_completed',
                    title: 'Task Completed',
                    description: task.title,
                    timestamp: task.updated_at,
                  })
                }
                allActivities.push({
                  id: `created_${task.id}`,
                  type: 'task_created',
                  title: 'Task Created',
                  description: task.title,
                  timestamp: task.created_at,
                })
              })
          }
        } catch {
          // silently fail
        }
      }

      if (contactsEnabled) {
        try {
          const res = await fetch('/api/modules/contacts')
          if (res.ok) {
            const contacts: Contact[] = await res.json()
            contacts
              .filter((c) => c.created_at)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 5)
              .forEach((contact) => {
                allActivities.push({
                  id: `contact_${contact.id}`,
                  type: 'contact_added',
                  title: 'Contact Added',
                  description: contact.name,
                  timestamp: contact.created_at,
                })
              })
          }
        } catch {
          // silently fail
        }
      }

      return allActivities
        .filter((a) => a.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 15)
    },
    enabled: tasksEnabled || contactsEnabled,
  })
}

export function useDashboardFlashData() {
  const { data: enabledModules = new Set<string>(), isLoading: modulesLoading } = useFlashEnabledModules()

  const tasksEnabled = enabledModules.has('tasks')
  const contactsEnabled = enabledModules.has('contacts')
  const fitnessEnabled = enabledModules.has('daily-fitness')
  const quotesEnabled = enabledModules.has('quotes')
  const notepadEnabled = enabledModules.has('notepad')
  const northstarEnabled = enabledModules.has('northstar')

  const tasksQuery = useFlashTasks(tasksEnabled)
  const contactsQuery = useFlashContacts(contactsEnabled)
  const fitnessQuery = useFlashFitnessStats(fitnessEnabled)
  const quoteQuery = useFlashQuote(quotesEnabled)
  const notepadQuery = useFlashNotepad(notepadEnabled)
  const northstarQuery = useFlashNorthstarGoals(northstarEnabled)
  const activityQuery = useFlashRecentActivity(tasksEnabled, contactsEnabled)

  const tasks = tasksQuery.data ?? []
  const now = new Date()

  const incompleteTasks = tasks.filter((t) => !t.completed)
  const completedTasks = tasks.filter((t) => t.completed)

  // Today's focus: top 5 urgent/priority tasks
  const todaysFocus = [...incompleteTasks]
    .sort((a, b) => {
      const aDue = a.due_date ? new Date(a.due_date) : null
      const bDue = b.due_date ? new Date(b.due_date) : null
      const aOverdue = aDue && aDue < now ? -1000 : 0
      const bOverdue = bDue && bDue < now ? -1000 : 0
      const aDueToday = aDue && aDue.toDateString() === now.toDateString() ? -500 : 0
      const bDueToday = bDue && bDue.toDateString() === now.toDateString() ? -500 : 0
      const aScore = (a.priority_score ?? 999) + aOverdue + aDueToday
      const bScore = (b.priority_score ?? 999) + bOverdue + bDueToday
      return aScore - bScore
    })
    .slice(0, 5)

  // Overdue tasks
  const overdueTasks = incompleteTasks.filter((t) => t.due_date && new Date(t.due_date) < now)

  // Due today
  const dueTodayTasks = incompleteTasks.filter((t) => {
    if (!t.due_date) return false
    return new Date(t.due_date).toDateString() === now.toDateString()
  })

  // Pinned tasks
  const pinnedTasks = incompleteTasks.filter((t) => t.pinned)

  // Top priority tasks (sorted by priority score)
  const priorityTasks = incompleteTasks
    .filter((t) => t.priority_score != null && t.priority_score > 0)
    .sort((a, b) => (a.priority_score ?? 0) - (b.priority_score ?? 0))
    .slice(0, 10)

  // Recent wins (last 8 completed)
  const recentWins = [...completedTasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)

  // Completed today count
  const completedToday = completedTasks.filter((t) => {
    const updated = new Date(t.updated_at)
    return updated.toDateString() === now.toDateString()
  }).length

  return {
    // Module availability
    enabledModules,
    tasksEnabled,
    contactsEnabled,
    fitnessEnabled,
    quotesEnabled,
    notepadEnabled,
    northstarEnabled,

    // Raw data
    tasks,
    contacts: contactsQuery.data ?? [],
    fitnessStats: fitnessQuery.data ?? DEFAULT_FITNESS_STATS,
    quote: quoteQuery.data,
    notepadContent: notepadQuery.data ?? '',
    northstarGoals: northstarQuery.data ?? [],
    recentActivity: activityQuery.data ?? [],

    // Derived task data
    incompleteTasks,
    completedTasks,
    todaysFocus,
    overdueTasks,
    dueTodayTasks,
    pinnedTasks,
    priorityTasks,
    recentWins,
    completedToday,
    contactCount: contactsQuery.data?.length ?? 0,

    // Loading
    isLoading: modulesLoading,
    isDataLoading: tasksQuery.isLoading || contactsQuery.isLoading,
  }
}
