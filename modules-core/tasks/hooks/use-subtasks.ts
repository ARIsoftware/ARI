import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Subtask, Task } from '@/modules/tasks/types'
import { createSubtask, updateSubtask, deleteSubtask } from '@/modules/tasks/lib/utils'

export type CreateSubtaskInput = {
  task_id: string
  title: string
}

export type UpdateSubtaskInput = {
  id: string
  title?: string
  completed?: boolean
  order_index?: number
}

/**
 * Optimistically created rows carry a temp id until the server row arrives.
 * The mutations below refuse to send such ids (the API validates ids as
 * UUIDs); the UI additionally disables the controls while this returns true.
 */
const TEMP_ID_PREFIX = 'temp-'

function makeTempSubtaskId() {
  return TEMP_ID_PREFIX + crypto.randomUUID()
}

export function isTempSubtaskId(id: string) {
  return id.startsWith(TEMP_ID_PREFIX)
}

/**
 * Fetch all subtasks for the current user in one query.
 * Components filter by task_id client-side, mirroring how the task list
 * itself is fetched as a single ['tasks'] query.
 */
export function useSubtasks() {
  return useQuery({
    queryKey: ['task-subtasks'],
    queryFn: async (): Promise<Subtask[]> => {
      const res = await fetch('/api/modules/tasks/subtasks')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch subtasks')
      }
      return res.json()
    },
  })
}

/**
 * Patch the parent task's subtask counters in the ['tasks'] cache so the
 * "Subtasks: x/y" progress UI updates in the same frame as the checklist.
 * The server recomputes the real counters (in the same transaction as the
 * mutation), so the cache converges on the next tasks refetch.
 */
function patchTaskCounters(
  queryClient: QueryClient,
  taskId: string,
  delta: { total?: number; completed?: number }
) {
  queryClient.setQueryData<Task[]>(['tasks'], (old = []) =>
    old.map(t => t.id === taskId
      ? {
          ...t,
          subtasks_total: Math.max(0, (t.subtasks_total ?? 0) + (delta.total ?? 0)),
          subtasks_completed: Math.max(0, (t.subtasks_completed ?? 0) + (delta.completed ?? 0)),
        }
      : t
    )
  )
}

type CacheSnapshot = {
  previous?: Subtask[]
  previousTasks?: Task[]
}

/** Shared optimistic-update scaffold: cancel refetches and snapshot both caches. */
async function snapshotCaches(queryClient: QueryClient): Promise<CacheSnapshot> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ['task-subtasks'] }),
    queryClient.cancelQueries({ queryKey: ['tasks'] }),
  ])
  return {
    previous: queryClient.getQueryData<Subtask[]>(['task-subtasks']),
    previousTasks: queryClient.getQueryData<Task[]>(['tasks']),
  }
}

/**
 * Shared error rollback: restore the snapshots, then invalidate both caches —
 * the snapshots may themselves be stale if another mutation overlapped, so a
 * refetch reconciles with the server's ground truth. Success paths write the
 * server response into the cache directly instead of invalidating, so a
 * checkbox toggle doesn't refetch every task and every subtask.
 */
function rollbackCaches(queryClient: QueryClient, context: CacheSnapshot | undefined) {
  if (context?.previous) {
    queryClient.setQueryData(['task-subtasks'], context.previous)
  }
  if (context?.previousTasks) {
    queryClient.setQueryData(['tasks'], context.previousTasks)
  }
  queryClient.invalidateQueries({ queryKey: ['task-subtasks'] })
  queryClient.invalidateQueries({ queryKey: ['tasks'] })
}

/**
 * Create a subtask with optimistic updates.
 */
export function useCreateSubtask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSubtaskInput): Promise<Subtask> =>
      createSubtask(input.task_id, input.title),
    onMutate: async (newSubtask) => {
      const snapshot = await snapshotCaches(queryClient)
      const tempId = makeTempSubtaskId()

      queryClient.setQueryData<Subtask[]>(['task-subtasks'], (old = []) => [
        ...old,
        {
          id: tempId,
          task_id: newSubtask.task_id,
          user_id: '',
          title: newSubtask.title,
          completed: false,
          order_index: old.filter(s => s.task_id === newSubtask.task_id).length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      patchTaskCounters(queryClient, newSubtask.task_id, { total: 1 })

      return { ...snapshot, tempId }
    },
    onSuccess: (serverRow, _input, context) => {
      queryClient.setQueryData<Subtask[]>(['task-subtasks'], (old = []) =>
        old.map(s => (s.id === context?.tempId ? serverRow : s))
      )
    },
    onError: (_err, _newSubtask, context) => {
      rollbackCaches(queryClient, context)
    },
  })
}

/**
 * Update a subtask (toggle completion, rename, reorder) with optimistic updates.
 */
export function useUpdateSubtask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateSubtaskInput): Promise<Subtask> => {
      if (isTempSubtaskId(id)) {
        throw new Error('Subtask is still saving — try again in a moment')
      }
      return updateSubtask(id, updates)
    },
    onMutate: async (updated) => {
      const snapshot = await snapshotCaches(queryClient)

      const current = snapshot.previous?.find(s => s.id === updated.id)
      queryClient.setQueryData<Subtask[]>(['task-subtasks'], (old = []) =>
        old.map(s => s.id === updated.id
          ? { ...s, ...updated, updated_at: new Date().toISOString() }
          : s
        )
      )
      if (current && updated.completed !== undefined && updated.completed !== current.completed) {
        patchTaskCounters(queryClient, current.task_id, { completed: updated.completed ? 1 : -1 })
      }

      return snapshot
    },
    onSuccess: (serverRow) => {
      queryClient.setQueryData<Subtask[]>(['task-subtasks'], (old = []) =>
        old.map(s => (s.id === serverRow.id ? serverRow : s))
      )
    },
    onError: (_err, _updated, context) => {
      rollbackCaches(queryClient, context)
    },
  })
}

/**
 * Delete a subtask with optimistic updates.
 */
export function useDeleteSubtask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (isTempSubtaskId(id)) {
        throw new Error('Subtask is still saving — try again in a moment')
      }
      return deleteSubtask(id)
    },
    onMutate: async (deletedId) => {
      const snapshot = await snapshotCaches(queryClient)

      const current = snapshot.previous?.find(s => s.id === deletedId)
      queryClient.setQueryData<Subtask[]>(['task-subtasks'], (old = []) =>
        old.filter(s => s.id !== deletedId)
      )
      if (current) {
        patchTaskCounters(queryClient, current.task_id, {
          total: -1,
          completed: current.completed ? -1 : 0,
        })
      }

      return snapshot
    },
    onError: (_err, _deletedId, context) => {
      rollbackCaches(queryClient, context)
    },
  })
}
