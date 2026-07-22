import { describe, it, expect, vi, afterEach } from 'vitest'

// fitness-stats.ts only exports incrementTaskCompletion which calls fetch.
// We stub the global fetch so we can test all branches without a network.

describe('incrementTaskCompletion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls /api/modules/tasks/increment-completion with POST and the taskId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { incrementTaskCompletion } = await import('@/lib/fitness-stats')
    await incrementTaskCompletion('task-42')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/modules/tasks/increment-completion')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ taskId: 'task-42' })
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('throws when the response is not ok and error has an error field', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Task not found' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    // Re-import to pick up fresh module with stubbed fetch
    vi.resetModules()
    const { incrementTaskCompletion } = await import('@/lib/fitness-stats')
    await expect(incrementTaskCompletion('bad-id')).rejects.toThrow('Task not found')
  })

  it('throws a generic message when response is not ok and error has no error field', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    vi.resetModules()
    const { incrementTaskCompletion } = await import('@/lib/fitness-stats')
    await expect(incrementTaskCompletion('bad-id')).rejects.toThrow(
      'Failed to increment task completion',
    )
  })
})
