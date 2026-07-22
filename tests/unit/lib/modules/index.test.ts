/**
 * Tests for lib/modules/index.ts
 *
 * The index module wraps the scanner and adds a simple in-memory cache for
 * getInstalledModules(). We mock the scanner so tests are deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mock the scanner before importing the module under test ──────────────────

vi.mock('@/lib/modules/scanner', () => ({
  scanInstalledModules: vi.fn(() => ['tasks', 'contacts']),
  scanForDuplicateModuleIds: vi.fn(() => []),
}))

// Import the module under test AFTER mocking
import { getInstalledModules, getDuplicateModuleErrors } from '@/lib/modules/index'
import { scanInstalledModules, scanForDuplicateModuleIds } from '@/lib/modules/scanner'

const mockScanInstalled = vi.mocked(scanInstalledModules)
const mockScanDuplicates = vi.mocked(scanForDuplicateModuleIds)

// ── The index module caches at module level, so we need isolation ─────────────
// We reset the module cache between describe blocks using vi.resetModules()
// but because the cache is module-level state, we test the caching behaviour
// within a single import lifecycle.

describe('getInstalledModules', () => {
  it('returns the list from scanner on first call', () => {
    const result = getInstalledModules()
    expect(Array.isArray(result)).toBe(true)
  })

  it('calls scanInstalledModules at most once (caching)', () => {
    // Reset call count
    mockScanInstalled.mockClear()
    // The cache is already set from previous call — subsequent calls should NOT
    // re-invoke the scanner
    getInstalledModules()
    getInstalledModules()
    // The scanner should NOT have been called again
    expect(mockScanInstalled).toHaveBeenCalledTimes(0)
  })
})

describe('getDuplicateModuleErrors', () => {
  beforeEach(() => {
    mockScanDuplicates.mockClear()
  })

  it('returns an empty array when no duplicates', () => {
    mockScanDuplicates.mockReturnValue([])
    const errors = getDuplicateModuleErrors()
    expect(errors).toEqual([])
  })

  it('always rescans (no caching)', () => {
    mockScanDuplicates.mockReturnValue([])
    getDuplicateModuleErrors()
    getDuplicateModuleErrors()
    // Should be called twice — no cache
    expect(mockScanDuplicates).toHaveBeenCalledTimes(2)
  })

  it('returns and logs errors when duplicates are found', () => {
    const dupError = {
      moduleId: 'tasks',
      directories: ['/modules-core/tasks', '/modules-core/tasks2'],
    }
    mockScanDuplicates.mockReturnValue([dupError])

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const errors = getDuplicateModuleErrors()

    expect(errors).toEqual([dupError])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate'),
      [dupError],
    )

    consoleSpy.mockRestore()
  })

  it('does NOT call console.error when no duplicates', () => {
    mockScanDuplicates.mockReturnValue([])
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getDuplicateModuleErrors()
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
