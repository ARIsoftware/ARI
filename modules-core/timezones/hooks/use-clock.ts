/**
 * Timezones Module - Client clock hooks
 *
 * Both values here are client-only: the current time and the browser's IANA
 * zone would each differ between the server render and the browser. They use
 * useSyncExternalStore rather than useState + useEffect so React handles the
 * hydration handoff itself — the server snapshot renders first, then React
 * swaps in the client value without a mismatch and without a cascading render.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { detectBrowserTimeZone } from '../lib/time'

/**
 * The board only ever renders hours and minutes, so it wakes on the minute
 * boundary rather than every second — 60x fewer re-renders, and the displayed
 * minute flips on time instead of up to a second late. The small pad absorbs
 * timer jitter so the wakeup lands just after the boundary, never just before.
 */
const TICK_MS = 60_000
const BOUNDARY_PAD_MS = 20

const listeners = new Set<() => void>()
let currentTime = 0
let timer: ReturnType<typeof setTimeout> | null = null

function scheduleNextTick(): void {
  const delay = TICK_MS - (Date.now() % TICK_MS) + BOUNDARY_PAD_MS

  timer = setTimeout(() => {
    currentTime = Date.now()
    for (const notify of listeners) notify()
    scheduleNextTick()
  }, delay)
}

function subscribeToClock(listener: () => void): () => void {
  listeners.add(listener)

  if (timer === null) {
    currentTime = Date.now()
    scheduleNextTick()

    // Notify even though this listener just arrived. Un-pinning the board
    // re-subscribes after React has already read the (frozen) snapshot for
    // this render, so without a nudge the clocks would keep showing the time
    // from when the board was pinned until the next minute boundary.
    for (const notify of listeners) notify()
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
}

function noopSubscribe(): () => void {
  return () => {}
}

function getTimeSnapshot(): number {
  // Cached, so repeated calls within a render return the identical value —
  // useSyncExternalStore requires a stable snapshot.
  if (currentTime === 0) currentTime = Date.now()
  return currentTime
}

function getServerTimeSnapshot(): null {
  return null
}

/**
 * Current time in ms, re-rendering on each minute boundary; null during the
 * server render, before the client snapshot lands.
 * Pass `enabled: false` to stop the timer while the board is pinned.
 */
export function useNow(enabled: boolean): number | null {
  const subscribe = useMemo(() => (enabled ? subscribeToClock : noopSubscribe), [enabled])
  return useSyncExternalStore(subscribe, getTimeSnapshot, getServerTimeSnapshot)
}

let cachedBrowserZone: string | null = null

function getBrowserZoneSnapshot(): string {
  if (cachedBrowserZone === null) cachedBrowserZone = detectBrowserTimeZone()
  return cachedBrowserZone
}

function getServerBrowserZoneSnapshot(): null {
  return null
}

/** The viewer's own IANA zone; null during the server render. */
export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noopSubscribe, getBrowserZoneSnapshot, getServerBrowserZoneSnapshot)
}
