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
  completed: boolean
  created_at: string
  updated_at: string
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
