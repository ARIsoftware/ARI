/**
 * tests/unit/modules-core/tasks/lib/utils.test.ts
 *
 * Tests for tasks/lib/utils.ts. The module makes network calls (fetch) and calls
 * incrementTaskCompletion from @/lib/fitness-stats. We stub both.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub @/lib/fitness-stats before importing utils
vi.mock('@/lib/fitness-stats', () => ({
  incrementTaskCompletion: vi.fn().mockResolvedValue(undefined),
}))

import { incrementTaskCompletion } from '@/lib/fitness-stats'
import {
  toDueDateString,
  agentStatusDotClass,
  recordTaskCompleted,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskCompletion,
  toggleTaskPin,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderTasks,
} from '@/modules-core/tasks/lib/utils'
import type { Task } from '@/modules-core/tasks/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    assignees: [],
    due_date: null,
    subtasks_completed: 0,
    subtasks_total: 0,
    status: 'Pending',
    priority: 'Medium',
    pinned: false,
    completed: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    order_index: 0,
    ...overrides,
  }
}

function mockFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(response),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// toDueDateString
// ---------------------------------------------------------------------------
describe('toDueDateString', () => {
  it('returns null when date is undefined', () => {
    expect(toDueDateString(undefined)).toBeNull()
  })

  it('formats a Date to yyyy-MM-dd (local calendar day)', () => {
    // Use a specific UTC date to avoid timezone-shift issues in CI
    // format() uses local time, so we create a date unambiguously in the local tz
    const d = new Date(2025, 0, 15) // Jan 15 2025 local
    expect(toDueDateString(d)).toBe('2025-01-15')
  })

  it('does not shift the date due to UTC conversion', () => {
    const d = new Date(2025, 11, 31) // Dec 31 2025 local
    expect(toDueDateString(d)).toBe('2025-12-31')
  })
})

// ---------------------------------------------------------------------------
// agentStatusDotClass
// ---------------------------------------------------------------------------
describe('agentStatusDotClass', () => {
  it('returns emerald for "working"', () => {
    expect(agentStatusDotClass('working')).toBe('bg-emerald-500')
  })

  it('returns red for "blocked"', () => {
    expect(agentStatusDotClass('blocked')).toBe('bg-red-500')
  })

  it('returns muted-foreground for any other status', () => {
    expect(agentStatusDotClass('idle')).toBe('bg-muted-foreground')
    expect(agentStatusDotClass('')).toBe('bg-muted-foreground')
    expect(agentStatusDotClass('unknown')).toBe('bg-muted-foreground')
  })
})

// ---------------------------------------------------------------------------
// recordTaskCompleted
// ---------------------------------------------------------------------------
describe('recordTaskCompleted', () => {
  it('calls incrementTaskCompletion with the task id', async () => {
    await recordTaskCompleted('task-abc')
    expect(incrementTaskCompletion).toHaveBeenCalledWith('task-abc')
  })

  it('does NOT throw when incrementTaskCompletion rejects (error is logged)', async () => {
    vi.mocked(incrementTaskCompletion).mockRejectedValueOnce(new Error('network'))
    await expect(recordTaskCompleted('task-abc')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getTasks
// ---------------------------------------------------------------------------
describe('getTasks', () => {
  it('returns tasks from the API', async () => {
    const tasks = [makeTask({ id: 'task-1' })]
    mockFetch(tasks)
    const result = await getTasks()
    expect(result).toEqual(tasks)
  })

  it('throws when response is not ok', async () => {
    mockFetch({ error: 'Not found' }, false, 404)
    await expect(getTasks()).rejects.toThrow('Not found')
  })

  it('throws with fallback message when error response has no .error key', async () => {
    mockFetch({}, false, 500)
    await expect(getTasks()).rejects.toThrow('Failed to fetch tasks')
  })
})

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------
describe('createTask', () => {
  it('POSTs and returns the created task', async () => {
    const task = makeTask({ id: 'new-task' })
    mockFetch(task)
    const input = { title: 'New', assignees: [], due_date: null, subtasks_completed: 0, subtasks_total: 0, status: 'Pending' as const, priority: 'Medium' as const, pinned: false, completed: false } as any
    const result = await createTask(input)
    expect(result.id).toBe('new-task')
  })

  it('throws on error response', async () => {
    mockFetch({ error: 'Validation failed' }, false, 422)
    await expect(createTask({
      title: '',
      assignees: [], due_date: null, subtasks_completed: 0, subtasks_total: 0,
      status: 'Pending', priority: 'Medium', pinned: false, completed: false,
    } as any)).rejects.toThrow('Validation failed')
  })
})

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------
describe('updateTask', () => {
  it('PUTs and returns the updated task', async () => {
    const updated = makeTask({ title: 'Updated' })
    mockFetch(updated)
    const result = await updateTask('task-1', { title: 'Updated' })
    expect(result.title).toBe('Updated')
  })

  it('throws on error response', async () => {
    mockFetch({ error: 'Not found' }, false, 404)
    await expect(updateTask('bad-id', {})).rejects.toThrow('Not found')
  })
})

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------
describe('deleteTask', () => {
  it('sends DELETE and resolves on success', async () => {
    mockFetch({ success: true })
    await expect(deleteTask('task-1')).resolves.toBeUndefined()
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('task-1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws on error response', async () => {
    mockFetch({ error: 'Task not found' }, false, 404)
    await expect(deleteTask('bad')).rejects.toThrow('Task not found')
  })
})

// ---------------------------------------------------------------------------
// toggleTaskCompletion
// ---------------------------------------------------------------------------
describe('toggleTaskCompletion', () => {
  it('toggles a pending task to completed', async () => {
    const original = makeTask({ id: 'task-1', completed: false, status: 'Pending' })
    const toggled = makeTask({ id: 'task-1', completed: true, status: 'Completed' })
    // First call: GET tasks list, second: PUT update
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([original]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(toggled) }),
    )
    const result = await toggleTaskCompletion('task-1')
    expect(result.completed).toBe(true)
    expect(result.status).toBe('Completed')
  })

  it('calls recordTaskCompleted when toggling to completed', async () => {
    const original = makeTask({ id: 'task-1', completed: false })
    const toggled = makeTask({ id: 'task-1', completed: true, status: 'Completed' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([original]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(toggled) }),
    )
    await toggleTaskCompletion('task-1')
    expect(incrementTaskCompletion).toHaveBeenCalledWith('task-1')
  })

  it('does NOT call recordTaskCompleted when toggling to incomplete', async () => {
    const original = makeTask({ id: 'task-1', completed: true, status: 'Completed' })
    const toggled = makeTask({ id: 'task-1', completed: false, status: 'Pending' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([original]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(toggled) }),
    )
    await toggleTaskCompletion('task-1')
    expect(incrementTaskCompletion).not.toHaveBeenCalled()
  })

  it('throws when the task is not found in the list', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }),
    )
    await expect(toggleTaskCompletion('missing')).rejects.toThrow('Task not found')
  })

  it('throws when the fetch fails', async () => {
    mockFetch({ error: 'Server error' }, false, 500)
    await expect(toggleTaskCompletion('task-1')).rejects.toThrow('Server error')
  })
})

// ---------------------------------------------------------------------------
// toggleTaskPin
// ---------------------------------------------------------------------------
describe('toggleTaskPin', () => {
  it('toggles pinned=false to true', async () => {
    const original = makeTask({ id: 'task-1', pinned: false })
    const toggled = makeTask({ id: 'task-1', pinned: true })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([original]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(toggled) }),
    )
    const result = await toggleTaskPin('task-1')
    expect(result.pinned).toBe(true)
  })

  it('throws when task not found', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }),
    )
    await expect(toggleTaskPin('missing')).rejects.toThrow('Task not found')
  })

  it('throws when fetch fails', async () => {
    mockFetch({ error: 'fail' }, false, 500)
    await expect(toggleTaskPin('task-1')).rejects.toThrow('fail')
  })
})

// ---------------------------------------------------------------------------
// createSubtask
// ---------------------------------------------------------------------------
describe('createSubtask', () => {
  it('POSTs and returns created subtask', async () => {
    const subtask = { id: 'sub-1', task_id: 'task-1', user_id: 'u1', title: 'Sub', completed: false, order_index: 0, created_at: '', updated_at: '' }
    mockFetch(subtask)
    const result = await createSubtask('task-1', 'Sub')
    expect(result.id).toBe('sub-1')
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Bad request' }, false, 400)
    await expect(createSubtask('task-1', '')).rejects.toThrow('Bad request')
  })
})

// ---------------------------------------------------------------------------
// updateSubtask
// ---------------------------------------------------------------------------
describe('updateSubtask', () => {
  it('PUTs and returns updated subtask', async () => {
    const subtask = { id: 'sub-1', task_id: 'task-1', user_id: 'u1', title: 'Updated', completed: true, order_index: 0, created_at: '', updated_at: '' }
    mockFetch(subtask)
    const result = await updateSubtask('sub-1', { title: 'Updated', completed: true })
    expect(result.title).toBe('Updated')
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Not found' }, false, 404)
    await expect(updateSubtask('bad', {})).rejects.toThrow('Not found')
  })
})

// ---------------------------------------------------------------------------
// deleteSubtask
// ---------------------------------------------------------------------------
describe('deleteSubtask', () => {
  it('DELETEs and resolves', async () => {
    mockFetch({ success: true })
    await expect(deleteSubtask('sub-1')).resolves.toBeUndefined()
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Not found' }, false, 404)
    await expect(deleteSubtask('bad')).rejects.toThrow('Not found')
  })
})

// ---------------------------------------------------------------------------
// reorderTasks
// ---------------------------------------------------------------------------
describe('reorderTasks', () => {
  it('sends PUT for each task with the correct order_index', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', fetchMock)
    await reorderTasks(['task-a', 'task-b', 'task-c'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // Check that order_index 0, 1, 2 are assigned
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body))
    expect(bodies[0]).toEqual({ id: 'task-a', updates: { order_index: 0 } })
    expect(bodies[1]).toEqual({ id: 'task-b', updates: { order_index: 1 } })
    expect(bodies[2]).toEqual({ id: 'task-c', updates: { order_index: 2 } })
  })

  it('throws when any PUT fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Server error' }) }),
    )
    await expect(reorderTasks(['task-a', 'task-b'])).rejects.toThrow('Server error')
  })

  it('handles an empty array gracefully', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(reorderTasks([])).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
