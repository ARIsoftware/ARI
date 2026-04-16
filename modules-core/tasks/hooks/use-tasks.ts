import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Task } from '@/modules/tasks/types'

// Input types for mutations
export type CreateTaskInput = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'order_index'>

export type UpdateTaskInput = {
  id: string
} & Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>

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
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])

      queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
        old.filter(t => t.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _deletedId, context) => {
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
