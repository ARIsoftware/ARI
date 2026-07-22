// Subtle, tactile sound effects for task interactions (add / complete / delete /
// edit / pin). Audio data is embedded as base64 data URIs in ./task-sounds-data
// so the Tasks module stays fully self-contained — no files in /public.
//
// Playback is best-effort: it is SSR-safe, silently ignores browser autoplay
// blocks, and honors a per-user mute preference persisted in localStorage.

import { TASK_SOUND_DATA, type TaskSoundName } from "@/modules/tasks/lib/task-sounds-data"

export type { TaskSoundName }

const MUTE_STORAGE_KEY = "ari:tasks:sound-muted"

// Kept deliberately quiet — these are meant to feel tactile, not loud. Per-sound
// overrides let the completion chime carry a touch more presence than the taps.
const SOUND_VOLUME: Record<TaskSoundName, number> = {
  add: 0.75,
  complete: 0.85,
  uncomplete: 0.55,
  delete: 0.75,
  edit: 0.7,
  tap: 0.6,
  // Hover fires on every task the cursor crosses — keep it soft and unobtrusive.
  hover: 0.35,
  // Segmented switches (filter tabs, view toggles, subtask chevron).
  tab: 0.4,
  // Header buttons (Add Task, Priority Radar).
  button: 0.55,
  // Quick-add panel opening.
  panel: 0.5,
}

// In-tab mirror of the persisted mute flag so listeners (e.g. a toggle button)
// can re-render without re-reading storage.
let mutedCache: boolean | null = null
const listeners = new Set<(muted: boolean) => void>()

/** Whether task sounds are currently muted (default: enabled). SSR-safe. */
export function isTaskSoundMuted(): boolean {
  if (typeof window === "undefined") return false
  if (mutedCache === null) {
    try {
      mutedCache = window.localStorage.getItem(MUTE_STORAGE_KEY) === "true"
    } catch {
      mutedCache = false
    }
  }
  return mutedCache
}

/** Mute or unmute task sounds and persist the choice. Notifies subscribers. */
export function setTaskSoundMuted(muted: boolean): void {
  mutedCache = muted
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted))
  } catch {
    // Private mode / storage disabled — keep the in-memory value.
  }
  listeners.forEach((fn) => fn(muted))
}

/** Subscribe to mute-state changes. Returns an unsubscribe function. */
export function subscribeTaskSoundMuted(fn: (muted: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Play a task sound. No-op on the server, when muted, or when the browser
 * blocks autoplay.
 *
 * A fresh <audio> is created per call from the embedded data URI (which decodes
 * instantly — no network) so overlapping actions each get feedback and we never
 * touch currentTime on an unloaded element, which throws in WebKit/Safari.
 */
export function playTaskSound(name: TaskSoundName): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return
  if (isTaskSoundMuted()) return

  try {
    const audio = new Audio(TASK_SOUND_DATA[name])
    audio.volume = SOUND_VOLUME[name]
    // play() returns a promise that rejects if autoplay is blocked — ignore it.
    const played = audio.play()
    if (played && typeof played.catch === "function") played.catch(() => {})
  } catch {
    // Never let a sound failure break the underlying action.
  }
}

let unlockPrimed = false

/**
 * Browsers block audio until the page receives a real user gesture (click /
 * keypress / tap) — and hover does NOT count, so the very first hover on a
 * fresh load would be silent. This arms a one-time listener that, on the first
 * such gesture anywhere on the page, plays a muted clip to satisfy the autoplay
 * policy. After that, later gesture-less plays (hover) are allowed. Idempotent
 * and SSR-safe; call it once on mount.
 */
export function primeTaskSoundUnlock(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return
  if (unlockPrimed) return
  unlockPrimed = true

  const unlock = () => {
    try {
      const audio = new Audio(TASK_SOUND_DATA.tap)
      audio.volume = 0 // silent — this play only exists to unlock audio
      audio.play()?.catch(() => {})
    } catch {
      // ignore — nothing to unlock if it throws
    }
    window.removeEventListener("pointerdown", unlock, true)
    window.removeEventListener("keydown", unlock, true)
    window.removeEventListener("touchstart", unlock, true)
  }

  window.addEventListener("pointerdown", unlock, true)
  window.addEventListener("keydown", unlock, true)
  window.addEventListener("touchstart", unlock, true)
}
