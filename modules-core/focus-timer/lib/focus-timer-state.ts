/**
 * Shared global focus timer state.
 * Uses the window object to ensure a single instance across all components.
 */

import { useEffect } from 'react'

export type FocusTimerListener = (isActive: boolean, timeRemaining: number) => void

export interface GlobalTimerState {
  isActive: boolean
  timeRemaining: number
  listeners: FocusTimerListener[]
}

declare global {
  interface Window {
    globalTimerState?: GlobalTimerState
  }
}

function createTimerState(): GlobalTimerState {
  return {
    isActive: false,
    timeRemaining: 0,
    listeners: [],
  }
}

export function getGlobalTimerState(): GlobalTimerState {
  if (typeof window === 'undefined') {
    return createTimerState()
  }
  if (!window.globalTimerState) {
    window.globalTimerState = createTimerState()
  }
  return window.globalTimerState
}

export function addFocusTimerListener(listener: FocusTimerListener): void {
  const state = getGlobalTimerState()
  if (state.listeners.includes(listener)) return
  state.listeners.push(listener)
}

export function removeFocusTimerListener(listener: FocusTimerListener): void {
  const state = getGlobalTimerState()
  const i = state.listeners.indexOf(listener)
  if (i !== -1) state.listeners.splice(i, 1)
}

/**
 * Subscribe a component to focus timer state changes for the lifetime of the effect.
 * The listener is automatically de-duplicated and removed on unmount.
 */
export function useFocusTimerListener(listener: FocusTimerListener): void {
  useEffect(() => {
    addFocusTimerListener(listener)
    return () => removeFocusTimerListener(listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
