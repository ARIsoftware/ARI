/**
 * Extra branch coverage for tasks/lib/utils.ts.
 * Targets uncovered branches: fallback message paths when error response
 * body has no .error key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/fitness-stats', () => ({
  incrementTaskCompletion: vi.fn().mockResolvedValue(undefined),
}))

import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderTasks,
  toggleTaskCompletion,
  toggleTaskPin,
} from '@/modules-core/tasks/lib/utils'

function mockFetch(response: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(response),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// Fallback error messages (no .error key in body)
describe('fallback error messages', () => {
  it('getTasks throws with fallback when body has no .error', async () => {
    mockFetch({}, false)
    await expect(getTasks()).rejects.toThrow('Failed to fetch tasks')
  })

  it('createTask throws with fallback', async () => {
    mockFetch({}, false)
    await expect(createTask({ title: 'x', assignees: [], due_date: null, subtasks_completed: 0, subtasks_total: 0, status: 'Pending', priority: 'Medium', pinned: false, completed: false } as any)).rejects.toThrow('Failed to create task')
  })

  it('updateTask throws with fallback', async () => {
    mockFetch({}, false)
    await expect(updateTask('id', {})).rejects.toThrow('Failed to update task')
  })

  it('deleteTask throws with fallback', async () => {
    mockFetch({}, false)
    await expect(deleteTask('id')).rejects.toThrow('Failed to delete task')
  })

  it('createSubtask throws with fallback', async () => {
    mockFetch({}, false)
    await expect(createSubtask('task-id', 'title')).rejects.toThrow('Failed to create subtask')
  })

  it('updateSubtask throws with fallback', async () => {
    mockFetch({}, false)
    await expect(updateSubtask('id', {})).rejects.toThrow('Failed to update subtask')
  })

  it('deleteSubtask throws with fallback', async () => {
    mockFetch({}, false)
    await expect(deleteSubtask('id')).rejects.toThrow('Failed to delete subtask')
  })

  it('reorderTasks throws with fallback', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) }),
    )
    await expect(reorderTasks(['a'])).rejects.toThrow('Failed to update task order')
  })

  it('toggleTaskCompletion fetch-list throws with fallback', async () => {
    mockFetch({}, false)
    await expect(toggleTaskCompletion('id')).rejects.toThrow('Failed to fetch tasks')
  })

  it('toggleTaskPin fetch-list throws with fallback', async () => {
    mockFetch({}, false)
    await expect(toggleTaskPin('id')).rejects.toThrow('Failed to fetch tasks')
  })
})
