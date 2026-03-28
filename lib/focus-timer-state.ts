/**
 * Shared global focus timer state.
 * Uses window object to ensure a single instance across all components.
 */

export interface GlobalTimerState {
  isActive: boolean
  timeRemaining: number
  listeners: Array<(isActive: boolean, timeRemaining: number) => void>
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
  if (!(window as any).globalTimerState) {
    (window as any).globalTimerState = createTimerState()
  }
  return (window as any).globalTimerState
}
