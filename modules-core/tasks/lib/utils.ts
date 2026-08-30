import { type Task, type Subtask, type CreateTaskInput } from '@/modules/tasks/types'
import { format } from 'date-fns'
import { incrementTaskCompletion } from '@/lib/fitness-stats'

export type { Task, Subtask, CreateTaskInput }

/**
 * Serialize a calendar-picker date for the due_date column. format() keeps
 * the local calendar day — toISOString() would shift the date back a day for
 * timezones east of UTC.
 */
export function toDueDateString(date: Date | undefined): string | null {
  return date ? format(date, 'yyyy-MM-dd') : null
}

/** Dot color for an agent's status — shared by AssignedAgentBadge and the assignee picker. */
export function agentStatusDotClass(status: string): string {
  return status === 'working'
    ? 'bg-emerald-500'
    : status === 'blocked'
      ? 'bg-red-500'
      : 'bg-muted-foreground'
}

/**
 * Record a completion for the fitness stats. Failures are logged, never
 * thrown — stats must not block the task update that already succeeded.
 * The single home for this rule; every path that flips completed to true
 * (list checkbox, edit page button) goes through here.
 */
export async function recordTaskCompleted(id: string): Promise<void> {
  try {
    await incrementTaskCompletion(id)
  } catch (error) {
    console.error('Failed to increment completion count:', error)
  }
}

export async function getTasks(): Promise<Task[]> {
  const response = await fetch('/api/modules/tasks')

  if (!response.ok) {
    const error = await response.json()
    console.error('Error fetching tasks:', error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  return await response.json()
}

export async function createTask(task: CreateTaskInput): Promise<Task> {
  const response = await fetch('/api/modules/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Error creating task:', error)
    throw new Error(error.error || 'Failed to create task')
  }

  return await response.json()
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const response = await fetch('/api/modules/tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, updates }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Error updating task:', error)
    throw new Error(error.error || 'Failed to update task')
  }

  return await response.json()
}

export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(`/api/modules/tasks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Error deleting task:', error)
    throw new Error(error.error || 'Failed to delete task')
  }
}

export async function toggleTaskCompletion(id: string): Promise<Task> {
  const response = await fetch('/api/modules/tasks')

  if (!response.ok) {
    const error = await response.json()
    console.error('Error fetching tasks:', error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  const tasks = await response.json()
  const currentTask = tasks.find((t: Task) => t.id === id)

  if (!currentTask) {
    throw new Error('Task not found')
  }

  const newCompleted = !currentTask.completed
  const newStatus = newCompleted ? 'Completed' : 'Pending'

  const updatedTask = await updateTask(id, {
    completed: newCompleted,
    status: newStatus,
  })

  if (newCompleted) {
    await recordTaskCompleted(id)
  }

  return updatedTask
}

export async function toggleTaskPin(id: string): Promise<Task> {
  const response = await fetch('/api/modules/tasks')

  if (!response.ok) {
    const error = await response.json()
    console.error('Error fetching tasks:', error)
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  const tasks = await response.json()
  const currentTask = tasks.find((t: Task) => t.id === id)

  if (!currentTask) {
    throw new Error('Task not found')
  }

  return updateTask(id, {
    pinned: !currentTask.pinned,
  })
}

// Takes the task object (not just the id): every call site already holds the
// row, so flipping the bit directly avoids a full-list pre-fetch and the
// read-modify-write race that comes with it.
export async function toggleTaskMask(task: Pick<Task, 'id' | 'is_private'>): Promise<Task> {
  return updateTask(task.id, {
    is_private: !task.is_private,
  })
}

export async function createSubtask(taskId: string, title: string): Promise<Subtask> {
  const response = await fetch('/api/modules/tasks/subtasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subtask: { task_id: taskId, title } }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Error creating subtask:', error)
    throw new Error(error.error || 'Failed to create subtask')
  }

  return await response.json()
}

export async function updateSubtask(
  id: string,
  updates: { title?: string; completed?: boolean; order_index?: number },
): Promise<Subtask> {
  const response = await fetch('/api/modules/tasks/subtasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, updates }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Error updating subtask:', error)
    throw new Error(error.error || 'Failed to update subtask')
  }

  return await response.json()
}

export async function deleteSubtask(id: string): Promise<void> {
  const response = await fetch(`/api/modules/tasks/subtasks?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Error deleting subtask:', error)
    throw new Error(error.error || 'Failed to delete subtask')
  }
}

export async function reorderTasks(taskIds: string[]): Promise<void> {
  const updates = taskIds.map((id, index) => ({
    id,
    order_index: index,
  }))

  for (const update of updates) {
    const response = await fetch('/api/modules/tasks', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: update.id,
        updates: { order_index: update.order_index },
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Error updating task order:', error)
      throw new Error(error.error || 'Failed to update task order')
    }
  }
}
