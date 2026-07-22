import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Task, CreateTaskInput, TaskStats } from '@/modules/tasks/types'

// Input types for mutations. subtasks_completed/subtasks_total are
// server-derived from task_subtasks rows and cannot be supplied by clients.
export type { CreateTaskInput }

export type UpdateTaskInput = {
  id: string
} & Partial<Omit<Task, 'id' | 'created_at' | 'updated_at' | 'subtasks_completed' | 'subtasks_total'>>

/**
 * Fetch all tasks for the current user.
 * Tasks are ordered by order_index ascending.
 */
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<Task[]> => {
      const res = await fetch('/api/modules/tasks')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch tasks')
      }
      return res.json()
    },
  })
}

/**
 * Fetch aggregated task analytics (totals, streaks, weekday/priority buckets,
 * recent completions) for the Analytics page.
 */
export function useTaskStats() {
  return useQuery({
    queryKey: ['task-stats'],
    queryFn: async (): Promise<TaskStats> => {
      const res = await fetch('/api/modules/tasks/stats')
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to fetch task stats')
      }
      return res.json()
    },
  })
}

/**
 * Fetch the soft-deleted tasks for the "Deleted" tab. Kept in a separate
 * query key (a child of ['tasks']) so invalidating ['tasks'] refreshes both
 * the active list and this one. Pass `enabled: false` to skip the fetch until
 * the Deleted tab is actually opened.
 */
export function useDeletedTasks(enabled: boolean = true) {
  return useQuery({
    queryKey: ['tasks', 'deleted'],
    enabled,
    queryFn: async (): Promise<Task[]> => {
      const res = await fetch('/api/modules/tasks?deleted=true')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch deleted tasks')
      }
      return res.json()
    },
  })
}

/**
 * Soft-delete (deleted:true) or restore (deleted:false) a task with optimistic
 * updates across BOTH the active ['tasks'] and Deleted ['tasks','deleted']
 * lists. Centralizes the cancel → snapshot → optimistic-remove → rollback →
 * invalidate dance (so the page doesn't hand-roll it), and refreshes the
 * analytics (['task-stats']) and dashboard (['dashboard-tasks']) counts, which
 * exclude soft-deleted rows.
 */
export function useSetTaskDeleted() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, deleted }: { id: string; deleted: boolean }): Promise<Task> => {
      const res = await fetch('/api/modules/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: { deleted } }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update task')
      }
      return res.json()
    },
    onMutate: async ({ id, deleted }) => {
      // Prefix-cancel both ['tasks'] and ['tasks','deleted'] so an in-flight
      // refetch can't re-add the row after we optimistically remove it.
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])
      const previousDeleted = queryClient.getQueryData<Task[]>(['tasks', 'deleted'])

      // Drop the row from the list it's leaving; onSettled refetches both lists
      // so it reappears in the correct one.
      const fromKey = deleted ? ['tasks'] : ['tasks', 'deleted']
      queryClient.setQueryData<Task[]>(fromKey, (old = []) => old.filter(t => t.id !== id))

      return { previous, previousDeleted }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous)
      }
      if (context?.previousDeleted) {
        queryClient.setQueryData(['tasks', 'deleted'], context.previousDeleted)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task-stats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-tasks'] })
    },
  })
}

/**
 * Create a new task with optimistic updates.
 * The UI updates immediately, then syncs with the server.
 */
export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (task: CreateTaskInput): Promise<Task> => {
      const res = await fetch('/api/modules/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create task')
      }
      return res.json()
    },
    // Optimistic update: update UI before server responds
    onMutate: async (newTask) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] })

      // Snapshot the previous value
      const previous = queryClient.getQueryData<Task[]>(['tasks'])

      // Optimistically update to the new value
      queryClient.setQueryData<Task[]>(['tasks'], (old = []) => [
        ...old,
        {
          ...newTask,
          id: 'temp-' + Date.now(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          order_index: old.length,
        } as Task,
      ])

      // Return context with the snapshot
      return { previous }
    },
    // Rollback on error
    onError: (_err, _newTask, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous)
      }
    },
    // Refetch to get real data from server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/**
 * Update an existing task with optimistic updates.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateTaskInput): Promise<Task> => {
      const res = await fetch('/api/modules/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update task')
      }
      return res.json()
    },
    onMutate: async (updatedTask) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])

      queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
        old.map(t => t.id === updatedTask.id
          ? { ...t, ...updatedTask, updated_at: new Date().toISOString() }
          : t
        )
      )

      return { previous }
    },
    onError: (_err, _updatedTask, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/**
 * Delete a task with optimistic updates.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/tasks?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete task')
      }
    },
    onMutate: async (deletedId) => {
      // Prefix-cancel covers both the active (['tasks']) and deleted
      // (['tasks','deleted']) queries — a permanent delete can target either.
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])
      const previousDeleted = queryClient.getQueryData<Task[]>(['tasks', 'deleted'])

      queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
        old.filter(t => t.id !== deletedId)
      )
      queryClient.setQueryData<Task[]>(['tasks', 'deleted'], (old = []) =>
        old.filter(t => t.id !== deletedId)
      )

      return { previous, previousDeleted }
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous)
      }
      if (context?.previousDeleted) {
        queryClient.setQueryData(['tasks', 'deleted'], context.previousDeleted)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      // Subtasks are cascade-deleted with the task — refresh their cache too.
      queryClient.invalidateQueries({ queryKey: ['task-subtasks'] })
      // Keep the analytics/dashboard counts (which exclude deleted rows) fresh.
      queryClient.invalidateQueries({ queryKey: ['task-stats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-tasks'] })
    },
  })
}

/**
 * Toggle task completion status with optimistic updates.
 */
export function useToggleTaskCompletion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<Task> => {
      // Get current task state
      const tasks = queryClient.getQueryData<Task[]>(['tasks']) || []
      const currentTask = tasks.find(t => t.id === id)

      if (!currentTask) {
        throw new Error('Task not found')
      }

      const newCompleted = !currentTask.completed
      const newStatus = newCompleted ? 'Completed' : 'Pending'

      const res = await fetch('/api/modules/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          updates: { completed: newCompleted, status: newStatus }
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to toggle task')
      }
      return res.json()
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])

      queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
        old.map(t => {
          if (t.id !== id) return t
          const newCompleted = !t.completed
          return {
            ...t,
            completed: newCompleted,
            status: newCompleted ? 'Completed' : 'Pending',
            updated_at: new Date().toISOString(),
          } as Task
        })
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/**
 * Toggle task pinned status with optimistic updates.
 */
export function useToggleTaskPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<Task> => {
      const tasks = queryClient.getQueryData<Task[]>(['tasks']) || []
      const currentTask = tasks.find(t => t.id === id)

      if (!currentTask) {
        throw new Error('Task not found')
      }

      const res = await fetch('/api/modules/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          updates: { pinned: !currentTask.pinned }
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to toggle pin')
      }
      return res.json()
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])

      queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
        old.map(t => t.id === id
          ? { ...t, pinned: !t.pinned, updated_at: new Date().toISOString() }
          : t
        )
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/**
 * Reorder tasks (update order_index for multiple tasks).
 * This is used for drag-and-drop reordering.
 */
export function useReorderTasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskIds: string[]): Promise<void> => {
      // Update each task's order_index
      const updates = taskIds.map((id, index) =>
        fetch('/api/modules/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, updates: { order_index: index } }),
        })
      )

      const results = await Promise.all(updates)
      const failed = results.find(r => !r.ok)
      if (failed) {
        throw new Error('Failed to reorder tasks')
      }
    },
    onMutate: async (taskIds) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])

      // Reorder tasks based on new taskIds order
      queryClient.setQueryData<Task[]>(['tasks'], (old = []) => {
        const taskMap = new Map(old.map(t => [t.id, t]))
        return taskIds
          .map((id, index) => {
            const task = taskMap.get(id)
            if (!task) return null
            return { ...task, order_index: index }
          })
          .filter((t): t is Task => t !== null)
      })

      return { previous }
    },
    onError: (_err, _taskIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
