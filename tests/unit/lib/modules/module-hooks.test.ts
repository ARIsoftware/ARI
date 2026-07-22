/**
 * Tests for lib/modules/module-hooks.ts
 *
 * These are React hooks, but all pure logic lives in the return values
 * computed from `useEnabledModulesFromContext()`. We mock the context so
 * we can exercise every branch without a DOM.
 *
 * Branches:
 *   useModules()        → always returns { modules, loading: false, error: null }
 *   useModule(id)       → id ? find() ?? null : null
 *   useModuleEnabled()  → { enabled: module !== null, loading: false, error: null }
 */
import { describe, it, expect, vi } from 'vitest'

// ── mock the context dependency ───────────────────────────────────────────────

const mockModules = [
  { id: 'tasks', name: 'Tasks', isValid: true, isOverridden: false, isEnabled: true, errors: [] },
  { id: 'contacts', name: 'Contacts', isValid: true, isOverridden: false, isEnabled: true, errors: [] },
]

vi.mock('@/lib/modules/context', () => ({
  useEnabledModulesFromContext: vi.fn(() => mockModules),
}))

import { useModules, useModuleEnabled } from '@/lib/modules/module-hooks'
import { useEnabledModulesFromContext } from '@/lib/modules/context'

const mockUseContext = vi.mocked(useEnabledModulesFromContext)

// ── useModules ────────────────────────────────────────────────────────────────

describe('useModules', () => {
  it('returns all enabled modules from context', () => {
    const result = useModules()
    expect(result.modules).toEqual(mockModules)
  })

  it('always has loading: false', () => {
    const result = useModules()
    expect(result.loading).toBe(false)
  })

  it('always has error: null', () => {
    const result = useModules()
    expect(result.error).toBeNull()
  })
})

// ── useModuleEnabled ──────────────────────────────────────────────────────────

describe('useModuleEnabled', () => {
  it('returns enabled: true for a known module ID', () => {
    const result = useModuleEnabled('tasks')
    expect(result.enabled).toBe(true)
    expect(result.loading).toBe(false)
    expect(result.error).toBeNull()
  })

  it('returns enabled: true for another known module', () => {
    const result = useModuleEnabled('contacts')
    expect(result.enabled).toBe(true)
  })

  it('returns enabled: false for an unknown module ID', () => {
    const result = useModuleEnabled('fitness')
    expect(result.enabled).toBe(false)
  })

  it('returns enabled: false when moduleId is null', () => {
    const result = useModuleEnabled(null)
    expect(result.enabled).toBe(false)
  })

  it('returns enabled: false when context has no modules', () => {
    mockUseContext.mockReturnValueOnce([])
    const result = useModuleEnabled('tasks')
    expect(result.enabled).toBe(false)
  })

  it('always has loading: false', () => {
    const result = useModuleEnabled('tasks')
    expect(result.loading).toBe(false)
  })

  it('always has error: null', () => {
    const result = useModuleEnabled('tasks')
    expect(result.error).toBeNull()
  })
})
