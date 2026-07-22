/**
 * Extra coverage for notepad/lib/notepad.ts.
 *
 * Targets:
 * - getNotepad: fallback error path when .error key is missing (line 21)
 * - saveNotepad: fallback error path (line 39)
 * - getNotepadRevisions: fallback error path (line 53)
 * - restoreNotepadRevision: fallback error path (line 72)
 */
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
  vi.unstubAllGlobals()
})

describe('notepad fallback error messages', () => {
  it('getNotepad throws fallback when body has no .error key', async () => {
    mockFetch({}, false)
    await expect(getNotepad()).rejects.toThrow('Failed to fetch notepad')
  })

  it('saveNotepad throws fallback when body has no .error key', async () => {
    mockFetch({}, false)
    await expect(saveNotepad('content')).rejects.toThrow('Failed to save notepad')
  })

  it('getNotepadRevisions throws fallback when body has no .error key', async () => {
    mockFetch({}, false)
    await expect(getNotepadRevisions()).rejects.toThrow('Failed to fetch notepad revisions')
  })

  it('restoreNotepadRevision throws fallback when body has no .error key', async () => {
    mockFetch({}, false)
    await expect(restoreNotepadRevision('rev-1')).rejects.toThrow('Failed to restore notepad revision')
  })
})
