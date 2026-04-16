export type Task = {
  id: string
  title: string
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
}

export interface MajorProject {
  id: string
  project_name: string
  [key: string]: any
}
