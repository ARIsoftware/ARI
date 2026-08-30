export type Task = {
  id: string
  title: string
  notes?: string | null
  assignees: string[]
  due_date: string | null
  subtasks_completed: number
  subtasks_total: number
  status: "Pending" | "In Progress" | "Completed"
  priority: "Low" | "Medium" | "High"
  pinned: boolean
  // Per-record privacy (multi-user): a private task is visible only to its
  // owner (user_id). Toggled via the eye icon; owner-only, API-enforced.
  is_private?: boolean
  user_id?: string
  completed: boolean
  // Soft delete: true means the task is hidden from normal views and lives in
  // the "Deleted" tab until it is permanently removed. deleted_at is stamped at
  // soft-delete time (cleared on restore) and orders the Deleted tab.
  deleted?: boolean
  deleted_at?: string | null
  created_at: string
  updated_at: string
  // Instant the task was last marked complete (null when not completed). Powers
  // the Analytics page; stamped/cleared by the API on completion toggle.
  completed_at?: string | null
  order_index: number
  impact?: number
  severity?: number
  timeliness?: number
  effort?: number
  strategic_fit?: number
  priority_score?: number
  project_id?: string | null
  // Task Monsters fields
  monster_type?: string | null
  monster_colors?: { primary: string; secondary: string } | null
  // Agent assignment (set by the Agents module)
  assigned_agent_id?: string | null
}

// Input for task creation. subtasks_completed/subtasks_total are
// server-derived from task_subtasks rows and cannot be supplied by clients.
export type CreateTaskInput = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'order_index' | 'subtasks_completed' | 'subtasks_total'>

export type Subtask = {
  id: string
  task_id: string
  user_id: string
  title: string
  completed: boolean
  order_index: number
  created_at: string
  updated_at: string
}

export interface MajorProject {
  id: string
  project_name: string
  [key: string]: any
}

// Aggregated analytics returned by GET /api/modules/tasks/stats (Analytics page).
export type TaskStats = {
  timezone: string
  total_completed: number
  active_days: number
  this_week: number
  current_streak: number
  longest_streak: number
  best_day: { date: string; count: number } | null
  by_weekday: { day_of_week: number; label: string; count: number }[]
  by_priority: { priority: "High" | "Medium" | "Low"; count: number }[]
  daily: { date: string; count: number }[]
  open_tasks: number
  overdue: number
  completion_rate: number
  recent: { id: string; title: string; priority: "High" | "Medium" | "Low"; completed_at: string }[]
}
