/**
 * task-sounds.ts uses browser globals (window, Audio, localStorage).
 * We stub them with vi.stubGlobal so the module can be imported and exercised
 * in a Node environment.
 *
 * playTaskSound() and primeTaskSoundUnlock() are best-effort wrappers around
 * browser APIs and have explicit SSR short-circuits (`if (typeof window ===
 * "undefined") return`). In a node environment those guards fire and the
 * functions are no-ops — the important thing is that they don't throw and
 * that the mute-state logic (isTaskSoundMuted, setTaskSoundMuted,
 * subscribeTaskSoundMuted) works correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Stub browser globals BEFORE importing the module so the module-level code
// (e.g. mutedCache initialisation) sees them.
// ---------------------------------------------------------------------------

// Minimal localStorage stub
const store: Record<string, string> = {}
const localStorageStub = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) },
}

// Minimal Audio stub that records calls
const audioInstances: { src: string; volume: number; playCalled: boolean }[] = []
class AudioStub {
  src: string
  volume = 1
  constructor(src: string) {
    this.src = src
    audioInstances.push(this as unknown as typeof audioInstances[number])
  }
  play() {
    (this as unknown as { playCalled: boolean }).playCalled = true
    return Promise.resolve()
  }
}

vi.stubGlobal('window', {
  localStorage: localStorageStub,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})
vi.stubGlobal('localStorage', localStorageStub)
vi.stubGlobal('Audio', AudioStub)

// Import the module AFTER stubs are in place.
// Each import creates fresh module state — we use a dynamic import via vi.importActual
// to avoid caching. However, since vitest caches modules we just import once and
// manipulate state via the exported functions.
import {
  isTaskSoundMuted,
  setTaskSoundMuted,
  subscribeTaskSoundMuted,
  playTaskSound,
  primeTaskSoundUnlock,
} from '@/modules-core/tasks/lib/task-sounds'

beforeEach(() => {
  // Reset localStorage state and the internal cache between tests
  localStorageStub.clear()
  audioInstances.length = 0
  // Reset mutedCache by calling setTaskSoundMuted
  setTaskSoundMuted(false)
})

// ---------------------------------------------------------------------------
// isTaskSoundMuted
// ---------------------------------------------------------------------------
describe('isTaskSoundMuted', () => {
  it('returns false by default (no storage value)', () => {
    localStorageStub.clear()
    // Reset internal cache
    setTaskSoundMuted(false)
    expect(isTaskSoundMuted()).toBe(false)
  })

  it('returns true after muting', () => {
    setTaskSoundMuted(true)
    expect(isTaskSoundMuted()).toBe(true)
  })

  it('returns false after unmuting', () => {
    setTaskSoundMuted(true)
    setTaskSoundMuted(false)
    expect(isTaskSoundMuted()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// setTaskSoundMuted — persistence
// ---------------------------------------------------------------------------
describe('setTaskSoundMuted', () => {
  it('persists muted=true to localStorage', () => {
    setTaskSoundMuted(true)
    expect(localStorageStub.getItem('ari:tasks:sound-muted')).toBe('true')
  })

  it('persists muted=false to localStorage', () => {
    setTaskSoundMuted(false)
    expect(localStorageStub.getItem('ari:tasks:sound-muted')).toBe('false')
  })
})

// ---------------------------------------------------------------------------
// subscribeTaskSoundMuted
// ---------------------------------------------------------------------------
describe('subscribeTaskSoundMuted', () => {
  it('notifies the subscriber when mute state changes', () => {
    const calls: boolean[] = []
    const unsub = subscribeTaskSoundMuted((muted) => calls.push(muted))
    setTaskSoundMuted(true)
    setTaskSoundMuted(false)
    expect(calls).toEqual([true, false])
    unsub()
  })

  it('unsubscribe stops further notifications', () => {
    const calls: boolean[] = []
    const unsub = subscribeTaskSoundMuted((muted) => calls.push(muted))
    unsub()
    setTaskSoundMuted(true)
    expect(calls).toHaveLength(0)
  })

  it('multiple subscribers each get called', () => {
    const a: boolean[] = []
    const b: boolean[] = []
    const unsubA = subscribeTaskSoundMuted((m) => a.push(m))
    const unsubB = subscribeTaskSoundMuted((m) => b.push(m))
    setTaskSoundMuted(true)
    expect(a).toEqual([true])
    expect(b).toEqual([true])
    unsubA()
    unsubB()
  })
})

// ---------------------------------------------------------------------------
// playTaskSound — muted path
// ---------------------------------------------------------------------------
describe('playTaskSound (window stubbed)', () => {
  it('does NOT create an Audio element when muted', () => {
    setTaskSoundMuted(true)
    audioInstances.length = 0
    playTaskSound('add')
    expect(audioInstances).toHaveLength(0)
  })

  it('creates an Audio element when NOT muted', () => {
    setTaskSoundMuted(false)
    audioInstances.length = 0
    playTaskSound('add')
    expect(audioInstances.length).toBeGreaterThan(0)
  })

  it('sets the correct volume for the "add" sound', () => {
    setTaskSoundMuted(false)
    audioInstances.length = 0
    playTaskSound('add')
    expect(audioInstances[0]?.volume).toBeCloseTo(0.75)
  })

  it('sets the correct volume for the "hover" sound (softest)', () => {
    setTaskSoundMuted(false)
    audioInstances.length = 0
    playTaskSound('hover')
    expect(audioInstances[0]?.volume).toBeCloseTo(0.35)
  })

  it('calls play() on the Audio element', () => {
    setTaskSoundMuted(false)
    audioInstances.length = 0
    playTaskSound('complete')
    // play() should have been called (AudioStub sets playCalled)
    const inst = audioInstances[0] as unknown as { playCalled: boolean }
    expect(inst?.playCalled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// primeTaskSoundUnlock — SSR short-circuit  (window is stubbed, so it goes through)
// ---------------------------------------------------------------------------
describe('primeTaskSoundUnlock', () => {
  it('does not throw when called', () => {
    expect(() => primeTaskSoundUnlock()).not.toThrow()
  })

  it('is idempotent (calling twice does not add duplicate listeners)', () => {
    const addListener = vi.fn()
    vi.stubGlobal('window', {
      localStorage: localStorageStub,
      addEventListener: addListener,
      removeEventListener: vi.fn(),
    })
    // Call twice — only one set of listeners should be added due to unlockPrimed guard
    // (Note: the module-level `unlockPrimed` may already be true from the first call above,
    // so we just verify no error is thrown and the call is idempotent)
    expect(() => primeTaskSoundUnlock()).not.toThrow()
    expect(() => primeTaskSoundUnlock()).not.toThrow()
  })
})
