import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// focus-timer-state.ts imports useEffect from 'react'. Mock it so the module
// loads cleanly in node without a React runtime.
vi.mock('react', () => ({
  useEffect: vi.fn(),
}))

import {
  getGlobalTimerState,
  addFocusTimerListener,
  removeFocusTimerListener,
} from '@/modules-core/focus-timer/lib/focus-timer-state'

describe('getGlobalTimerState — node env (no window)', () => {
  it('returns a fresh state object with correct defaults', () => {
    // In node, typeof window === 'undefined', so createTimerState() is returned
    const state = getGlobalTimerState()
    expect(state.isActive).toBe(false)
    expect(state.timeRemaining).toBe(0)
    expect(Array.isArray(state.listeners)).toBe(true)
    expect(state.listeners.length).toBe(0)
  })
})

describe('getGlobalTimerState — with window stub', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initializes globalTimerState when not present', () => {
    vi.stubGlobal('window', {})
    const state = getGlobalTimerState()
    expect(state.isActive).toBe(false)
    expect(state.timeRemaining).toBe(0)
    expect(Array.isArray(state.listeners)).toBe(true)
  })

  it('reuses existing globalTimerState', () => {
    const existing = { isActive: true, timeRemaining: 120, listeners: [] }
    vi.stubGlobal('window', { globalTimerState: existing })
    const state = getGlobalTimerState()
    expect(state).toBe(existing)
    expect(state.isActive).toBe(true)
    expect(state.timeRemaining).toBe(120)
  })
})

describe('addFocusTimerListener / removeFocusTimerListener — node env', () => {
  // In node env, getGlobalTimerState() returns a fresh object each call.
  // We need to test the listener logic by controlling the state.

  beforeEach(() => {
    // Stub window so we get a shared state object across calls
    vi.stubGlobal('window', {})
    // Ensure fresh state
    ;(globalThis as { window?: { globalTimerState?: unknown } }).window!.globalTimerState = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('addFocusTimerListener adds a listener', () => {
    const listener = vi.fn()
    addFocusTimerListener(listener)
    const state = getGlobalTimerState()
    expect(state.listeners).toContain(listener)
  })

  it('addFocusTimerListener does not add duplicate listeners', () => {
    const listener = vi.fn()
    addFocusTimerListener(listener)
    addFocusTimerListener(listener)
    const state = getGlobalTimerState()
    expect(state.listeners.filter((l) => l === listener).length).toBe(1)
  })

  it('removeFocusTimerListener removes a listener', () => {
    const listener = vi.fn()
    addFocusTimerListener(listener)
    removeFocusTimerListener(listener)
    const state = getGlobalTimerState()
    expect(state.listeners).not.toContain(listener)
  })

  it('removeFocusTimerListener is a no-op when listener not present', () => {
    const listener = vi.fn()
    // Should not throw
    expect(() => removeFocusTimerListener(listener)).not.toThrow()
  })

  it('can add and remove multiple listeners independently', () => {
    const l1 = vi.fn()
    const l2 = vi.fn()
    addFocusTimerListener(l1)
    addFocusTimerListener(l2)
    removeFocusTimerListener(l1)
    const state = getGlobalTimerState()
    expect(state.listeners).not.toContain(l1)
    expect(state.listeners).toContain(l2)
  })
})
