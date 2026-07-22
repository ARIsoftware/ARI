/**
 * Extra coverage for task-sounds.ts — targets the branches and lines not hit
 * by the main task-sounds.test.ts file:
 *
 *   - isTaskSoundMuted() when mutedCache is null (reads from localStorage)
 *   - localStorage.getItem throwing (catch branch → mutedCache = false)
 *   - isTaskSoundMuted/playTaskSound/primeTaskSoundUnlock SSR branches (window undefined)
 *   - playTaskSound() when audio.play() returns undefined (no .catch call)
 *   - primeTaskSoundUnlock() — the unlock event callback (triggered by dispatching events)
 *
 * NOTE: task-sounds.ts has module-level state (mutedCache, unlockPrimed). We use
 * vi.resetModules() + dynamic import to get a fresh module instance per test
 * that needs isolated state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// SSR paths — typeof window === 'undefined'
// ---------------------------------------------------------------------------
describe('task-sounds SSR branches (window undefined)', () => {
  it('isTaskSoundMuted returns false when window is undefined', async () => {
    vi.resetModules()
    // Remove window entirely so typeof window === 'undefined'
    const saved = globalThis.window
    // @ts-expect-error removing window for SSR test
    delete globalThis.window
    let result: boolean | undefined
    try {
      const mod = await import('@/modules-core/tasks/lib/task-sounds')
      result = mod.isTaskSoundMuted()
    } finally {
      if (saved !== undefined) vi.stubGlobal('window', saved)
    }
    expect(result).toBe(false)
  })

  it('playTaskSound is a no-op when window is undefined', async () => {
    vi.resetModules()
    const saved = globalThis.window
    // @ts-expect-error removing window for SSR test
    delete globalThis.window
    let threw = false
    try {
      const mod = await import('@/modules-core/tasks/lib/task-sounds')
      mod.playTaskSound('add')
    } catch {
      threw = true
    } finally {
      if (saved !== undefined) vi.stubGlobal('window', saved)
    }
    expect(threw).toBe(false)
  })

  it('primeTaskSoundUnlock is a no-op when window is undefined', async () => {
    vi.resetModules()
    const saved = globalThis.window
    // @ts-expect-error removing window for SSR test
    delete globalThis.window
    let threw = false
    try {
      const mod = await import('@/modules-core/tasks/lib/task-sounds')
      mod.primeTaskSoundUnlock()
    } catch {
      threw = true
    } finally {
      if (saved !== undefined) vi.stubGlobal('window', saved)
    }
    expect(threw).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isTaskSoundMuted — reads from localStorage when mutedCache is null
// ---------------------------------------------------------------------------
describe('isTaskSoundMuted — reads localStorage when cache is null', () => {
  it('reads localStorage.getItem and returns true when stored value is "true"', async () => {
    const store: Record<string, string> = { 'ari:tasks:sound-muted': 'true' }
    const localStorageStub = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    }

    vi.stubGlobal('window', { localStorage: localStorageStub, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('localStorage', localStorageStub)
    vi.stubGlobal('Audio', class { play() { return Promise.resolve() } })

    // Fresh module — mutedCache starts as null
    const mod = await import('@/modules-core/tasks/lib/task-sounds')
    const result = mod.isTaskSoundMuted()
    expect(result).toBe(true)
  })

  it('catches localStorage.getItem errors and defaults to false', async () => {
    const throwingStorage = {
      getItem: () => { throw new Error('Storage disabled') },
      setItem: () => { throw new Error('Storage disabled') },
      removeItem: vi.fn(),
      clear: vi.fn(),
    }

    vi.stubGlobal('window', { localStorage: throwingStorage, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('localStorage', throwingStorage)
    vi.stubGlobal('Audio', class { play() { return Promise.resolve() } })

    vi.resetModules()
    const mod = await import('@/modules-core/tasks/lib/task-sounds')
    const result = mod.isTaskSoundMuted()
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// playTaskSound — when audio.play() returns undefined (no .catch needed)
// ---------------------------------------------------------------------------
describe('playTaskSound — play() returns undefined', () => {
  it('does not crash when play() returns undefined (no .catch call)', async () => {
    const audioInstances: { src: string; volume: number }[] = []
    class AudioStubNoPromise {
      src: string
      volume = 1
      constructor(src: string) { this.src = src; audioInstances.push(this as never) }
      play(): undefined { return undefined }
    }

    const store: Record<string, string> = {}
    const localStorageStub = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    }

    vi.resetModules()
    vi.stubGlobal('window', { localStorage: localStorageStub, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('localStorage', localStorageStub)
    vi.stubGlobal('Audio', AudioStubNoPromise)

    const mod = await import('@/modules-core/tasks/lib/task-sounds')
    mod.setTaskSoundMuted(false)

    let didThrow = false
    try {
      mod.playTaskSound('tap')
    } catch {
      didThrow = true
    }

    expect(didThrow).toBe(false)
    expect(audioInstances.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// playTaskSound — when audio.play() returns a rejecting promise (covers .catch callback)
// ---------------------------------------------------------------------------
describe('playTaskSound — play() returns a rejected promise', () => {
  it('silently catches autoplay rejection via .catch(() => {})', async () => {
    const store: Record<string, string> = {}
    const localStorageStub = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    }

    class AudioStubRejectPlay {
      src: string
      volume = 1
      constructor(src: string) { this.src = src }
      play(): Promise<void> {
        return Promise.reject(new DOMException('NotAllowedError: autoplay blocked'))
      }
    }

    vi.resetModules()
    vi.stubGlobal('window', { localStorage: localStorageStub, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('localStorage', localStorageStub)
    vi.stubGlobal('Audio', AudioStubRejectPlay)

    const mod = await import('@/modules-core/tasks/lib/task-sounds')
    mod.setTaskSoundMuted(false)

    // Should not throw even though play() rejects — .catch(() => {}) swallows it
    let didThrow = false
    try {
      mod.playTaskSound('tap')
      // Allow microtask queue to flush so the .catch runs
      await Promise.resolve()
    } catch {
      didThrow = true
    }
    expect(didThrow).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// primeTaskSoundUnlock — audio.play()?.catch callback (anonymous_9 at line 110)
// Covers the case where the unlock audio play() returns a rejecting promise
// ---------------------------------------------------------------------------
describe('primeTaskSoundUnlock — unlock audio play() rejects', () => {
  it('silently ignores play rejection in unlock callback via .catch(() => {})', async () => {
    const store: Record<string, string> = {}
    const localStorageStub = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    }

    class AudioStubRejectPlay {
      src: string
      volume = 0
      constructor(src: string) { this.src = src }
      play(): Promise<void> {
        return Promise.reject(new DOMException('NotAllowedError'))
      }
    }

    const listeners: Record<string, Array<() => void>> = {}
    const mockWindow = {
      localStorage: localStorageStub,
      addEventListener: (event: string, fn: () => void) => {
        if (!listeners[event]) listeners[event] = []
        listeners[event].push(fn)
      },
      removeEventListener: (event: string, fn: () => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter(l => l !== fn)
        }
      },
    }

    vi.resetModules()
    vi.stubGlobal('window', mockWindow)
    vi.stubGlobal('localStorage', localStorageStub)
    vi.stubGlobal('Audio', AudioStubRejectPlay)

    const mod = await import('@/modules-core/tasks/lib/task-sounds')
    mod.primeTaskSoundUnlock()

    // Trigger the unlock
    let didThrow = false
    try {
      listeners['pointerdown']?.[0]?.()
      // Allow microtask queue to flush so the .catch runs
      await Promise.resolve()
    } catch {
      didThrow = true
    }
    expect(didThrow).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// primeTaskSoundUnlock — unlock callback triggered by captured event listener
// ---------------------------------------------------------------------------
describe('primeTaskSoundUnlock — unlock callback execution', () => {
  it('executes the unlock callback when a pointerdown event fires', async () => {
    const audioInstances: { src: string; volume: number }[] = []
    class AudioStub {
      src: string
      volume = 1
      constructor(src: string) { this.src = src; audioInstances.push(this as never) }
      play() { return Promise.resolve() }
    }

    const store: Record<string, string> = {}
    const localStorageStub = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    }

    const listeners: Record<string, Array<() => void>> = {}
    const mockWindow = {
      localStorage: localStorageStub,
      addEventListener: (event: string, fn: () => void) => {
        if (!listeners[event]) listeners[event] = []
        listeners[event].push(fn)
      },
      removeEventListener: (event: string, fn: () => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter(l => l !== fn)
        }
      },
    }

    vi.resetModules()
    vi.stubGlobal('window', mockWindow)
    vi.stubGlobal('localStorage', localStorageStub)
    vi.stubGlobal('Audio', AudioStub)

    const mod = await import('@/modules-core/tasks/lib/task-sounds')
    mod.primeTaskSoundUnlock()

    // Listeners should have been registered
    expect(listeners['pointerdown']?.length).toBeGreaterThan(0)

    // Trigger the unlock callback via pointerdown
    const audioCountBefore = audioInstances.length
    listeners['pointerdown']?.[0]?.()

    // Unlock creates a silent Audio instance
    expect(audioInstances.length).toBeGreaterThan(audioCountBefore)
    expect(audioInstances[audioInstances.length - 1].volume).toBe(0)

    // After unlock, all listeners removed
    expect((listeners['pointerdown'] ?? []).length).toBe(0)
    expect((listeners['keydown'] ?? []).length).toBe(0)
    expect((listeners['touchstart'] ?? []).length).toBe(0)
  })

  it('unlock callback is silent when Audio constructor throws', async () => {
    const store: Record<string, string> = {}
    const localStorageStub = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    }

    const listeners: Record<string, Array<() => void>> = {}
    const mockWindow = {
      localStorage: localStorageStub,
      addEventListener: (event: string, fn: () => void) => {
        if (!listeners[event]) listeners[event] = []
        listeners[event].push(fn)
      },
      removeEventListener: (event: string, fn: () => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter(l => l !== fn)
        }
      },
    }

    vi.resetModules()
    vi.stubGlobal('window', mockWindow)
    vi.stubGlobal('localStorage', localStorageStub)
    vi.stubGlobal('Audio', class { constructor() { throw new Error('Audio not supported') } })

    const mod = await import('@/modules-core/tasks/lib/task-sounds')
    mod.primeTaskSoundUnlock()

    let didThrow = false
    try {
      listeners['pointerdown']?.[0]?.()
    } catch {
      didThrow = true
    }

    // Error is swallowed by try/catch inside unlock
    expect(didThrow).toBe(false)
  })
})
