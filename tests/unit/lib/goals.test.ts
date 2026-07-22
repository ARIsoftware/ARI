import { describe, it, expect, vi, afterEach } from 'vitest'

describe('getGoals', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('returns an array of goals on success', async () => {
    const fakeGoals = [
      {
        id: '1',
        title: 'Run a marathon',
        description: '',
        category: 'fitness',
        priority: 'high',
        deadline: null,
        progress: 0,
        user_email: 'a@b.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeGoals,
    }))

    const { getGoals } = await import('@/lib/goals')
    const result = await getGoals()
    expect(result).toEqual(fakeGoals)
  })

  it('calls /api/goals with credentials include', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getGoals } = await import('@/lib/goals')
    await getGoals()

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/goals')
    expect(init.credentials).toBe('include')
  })

  it('throws with the error message when not ok and error has error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    }))

    const { getGoals } = await import('@/lib/goals')
    await expect(getGoals()).rejects.toThrow('Unauthorized')
  })

  it('throws a generic message when not ok and no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }))

    const { getGoals } = await import('@/lib/goals')
    await expect(getGoals()).rejects.toThrow('Failed to fetch goals')
  })
})
