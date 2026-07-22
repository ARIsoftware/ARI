import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getNotepad,
  saveNotepad,
  getNotepadRevisions,
  restoreNotepadRevision,
} from '@/modules-core/notepad/lib/notepad'

function mockFetch(response: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(response),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getNotepad', () => {
  it('returns the notepad content', async () => {
    const notepad = { content: 'Hello World', updated_at: '2025-01-01T00:00:00Z' }
    mockFetch(notepad)
    const result = await getNotepad()
    expect(result.content).toBe('Hello World')
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Server error' }, false)
    await expect(getNotepad()).rejects.toThrow('Server error')
  })

  it('throws with fallback message when no error key', async () => {
    mockFetch({}, false)
    await expect(getNotepad()).rejects.toThrow('Failed to fetch notepad')
  })
})

describe('saveNotepad', () => {
  it('POSTs content and returns updated notepad', async () => {
    const notepad = { content: 'Updated content', updated_at: '2025-01-02T00:00:00Z' }
    mockFetch(notepad)
    const result = await saveNotepad('Updated content')
    expect(result.content).toBe('Updated content')
  })

  it('sends the content in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ content: 'x', updated_at: null }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await saveNotepad('my notes')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ content: 'my notes' })
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Not found' }, false)
    await expect(saveNotepad('test')).rejects.toThrow('Not found')
  })
})

describe('getNotepadRevisions', () => {
  it('returns an array of revisions', async () => {
    const revisions = [
      { id: 'r1', content: 'v1', created_at: '2025-01-01', revision_number: 1 },
      { id: 'r2', content: 'v2', created_at: '2025-01-02', revision_number: 2 },
    ]
    mockFetch(revisions)
    const result = await getNotepadRevisions()
    expect(result).toHaveLength(2)
    expect(result[0].revision_number).toBe(1)
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Unauthorized' }, false)
    await expect(getNotepadRevisions()).rejects.toThrow('Unauthorized')
  })
})

describe('restoreNotepadRevision', () => {
  it('POSTs revision_id and returns restored notepad', async () => {
    const notepad = { content: 'Restored', updated_at: '2025-01-03T00:00:00Z' }
    mockFetch(notepad)
    const result = await restoreNotepadRevision('rev-123')
    expect(result.content).toBe('Restored')
  })

  it('sends the revision_id in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ content: 'restored', updated_at: null }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await restoreNotepadRevision('rev-xyz')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ revision_id: 'rev-xyz' })
  })

  it('throws on error', async () => {
    mockFetch({ error: 'Revision not found' }, false)
    await expect(restoreNotepadRevision('bad')).rejects.toThrow('Revision not found')
  })
})
