import type { DashboardLayout } from '@/modules/dashboard/lib/validation'

export interface ActivityItem {
  id: string
  type: 'task_created' | 'task_completed' | 'contact_added'
  title: string
  description: string
  timestamp: string
}

/** Per-user dashboard settings stored in module_settings. */
export interface DashboardSettings {
  layout?: DashboardLayout
}

// Minimal local shapes of the other modules' API responses — the dashboard
// stays self-contained and doesn't import types from those modules.

// Row shape of GET /api/modules/tasks and /api/modules/tasks/priorities.
// Kept in sync with the shared ['tasks'] TanStack cache used by the tasks module.
export interface DashboardTask {
  id: string
  title: string
  status: 'Pending' | 'In Progress' | 'Completed'
  priority: 'Low' | 'Medium' | 'High'
  completed: boolean
  due_date: string | null
  impact: number | null
  severity: number | null
  timeliness: number | null
  effort: number | null
  strategic_fit: number | null
  priority_score: string | number | null
}

export interface BriefWeather {
  available: boolean
  city: string | null
  high: number | null
}

export interface BriefGreeting {
  message: string
}

export interface BriefVoiceSettings {
  selectedVoiceProvider: string | null
}

export interface DashboardQuote {
  id: string
  quote: string
  author?: string | null
}
