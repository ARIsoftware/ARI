/**
 * Extra coverage for focus-timer-state.ts
 *
 * The existing test covers everything except useFocusTimerListener (lines 57-59),
 * which is a React hook that calls useEffect. We test it by verifying useEffect
 * is called with the right arguments and that the cleanup function invokes
 * removeFocusTimerListener.
 */
import { describe, it, expect, vi } from 'vitest'

// React is mocked — capture what useEffect receives
let capturedEffect: (() => (() => void) | void) | null = null

vi.mock('react', () => ({
  useEffect: vi.fn((fn: () => (() => void) | void) => {
    capturedEffect = fn
  }),
}))

import { useFocusTimerListener, addFocusTimerListener, getGlobalTimerState } from '@/modules-core/focus-timer/lib/focus-timer-state'

describe('useFocusTimerListener', () => {
  it('calls useEffect once when mounted', async () => {
    const { useEffect } = await import('react')
    const listener = vi.fn()

    capturedEffect = null
    useFocusTimerListener(listener)

    expect(useEffect).toHaveBeenCalledTimes(1)
    expect(capturedEffect).toBeTypeOf('function')
  })

  it('the effect callback adds the listener and returns a cleanup that removes it', () => {
    vi.stubGlobal('window', {})
    ;(globalThis as { window?: { globalTimerState?: unknown } }).window!.globalTimerState = undefined

    const listener = vi.fn()
    capturedEffect = null
    useFocusTimerListener(listener)

    // Run the captured effect
    const cleanup = capturedEffect ? (capturedEffect as () => (() => void) | void)() : undefined

    // Listener should have been added
    const state = getGlobalTimerState()
    expect(state.listeners).toContain(listener)

    // Run cleanup
    if (typeof cleanup === 'function') cleanup()

    // Listener should have been removed
    expect(state.listeners).not.toContain(listener)

    vi.unstubAllGlobals()
  })
})
