/**
 * Health Data module - upload store
 *
 * Module-scoped singleton holding the client-side upload state. Every
 * health-data page mounts its own <HealthGate>, so navigating between
 * pages mid-upload remounts the gate — mount-local state (useMutation's
 * isPending / a useState percent) is lost and the fresh gate would show
 * the upload screen again, inviting a second upload that kills the
 * in-flight session server-side. Keeping the state here means any mount
 * sees the upload, regardless of which mount started it.
 *
 * Consumed via useSyncExternalStore — no new dependencies.
 */

import { useSyncExternalStore } from 'react'

export interface UploadState {
  status: 'idle' | 'uploading'
  /** 0–100 chunk-upload progress (client → server share of the bar) */
  percent: number
  /** Message from the most recent failed upload attempt, if any */
  error: string | null
}

let state: UploadState = { status: 'idle', percent: 0, error: null }

const listeners = new Set<() => void>()

function set(partial: Partial<UploadState>) {
  state = { ...state, ...partial }
  listeners.forEach((listener) => listener())
}

export const uploadStore = {
  getSnapshot: (): UploadState => state,

  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** A new upload is starting — clears any previous error */
  start: () => set({ status: 'uploading', percent: 0, error: null }),

  setPercent: (percent: number) => set({ percent }),

  /** Upload finished successfully */
  finish: () => set({ status: 'idle' }),

  /** Upload failed — keep the message for the upload screen */
  fail: (message: string) => set({ status: 'idle', error: message }),
}

/** Reactive view of the singleton upload state */
export function useUploadStore(): UploadState {
  return useSyncExternalStore(uploadStore.subscribe, uploadStore.getSnapshot, uploadStore.getSnapshot)
}
