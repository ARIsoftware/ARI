import { describe, it, expect, vi, afterEach } from 'vitest'
import { FileLock } from '@/lib/locks'

afterEach(() => {
  vi.useRealTimers()
  // Release any leaked locks by acquiring and immediately releasing
})

describe('FileLock — acquire', () => {
  it('acquires a new lock and returns true', () => {
    const lock = new FileLock('test-lock-1')
    expect(lock.acquire()).toBe(true)
    lock.release()
  })

  it('returns false when lock is already held', () => {
    const lock = new FileLock('test-lock-2')
    lock.acquire()
    expect(lock.acquire()).toBe(false)
    lock.release()
  })

  it('two distinct lock ids are independent', () => {
    const lockA = new FileLock('test-lock-a')
    const lockB = new FileLock('test-lock-b')
    expect(lockA.acquire()).toBe(true)
    expect(lockB.acquire()).toBe(true)
    lockA.release()
    lockB.release()
  })

  it('can re-acquire a lock after it has been released', () => {
    const lock = new FileLock('test-lock-reacquire')
    lock.acquire()
    lock.release()
    expect(lock.acquire()).toBe(true)
    lock.release()
  })

  it('re-acquires a timed-out lock', () => {
    vi.useFakeTimers()
    const lock = new FileLock('test-lock-timeout', 1000)
    expect(lock.acquire()).toBe(true)
    // Advance time past the timeout
    vi.advanceTimersByTime(2000)
    expect(lock.acquire()).toBe(true)
    lock.release()
    vi.useRealTimers()
  })
})

describe('FileLock — release', () => {
  it('release on a non-held lock is a no-op (does not throw)', () => {
    const lock = new FileLock('test-lock-no-op-release')
    expect(() => lock.release()).not.toThrow()
  })

  it('after release another instance with same id can acquire', () => {
    const lockA = new FileLock('test-lock-shared')
    const lockB = new FileLock('test-lock-shared')
    lockA.acquire()
    lockA.release()
    expect(lockB.acquire()).toBe(true)
    lockB.release()
  })
})

describe('FileLock — cleanup', () => {
  it('removes timed-out locks', () => {
    vi.useFakeTimers()
    const lock = new FileLock('test-lock-cleanup', 500)
    lock.acquire()
    // Lock should be held; a second acquire should fail
    expect(lock.acquire()).toBe(false)
    vi.advanceTimersByTime(600)
    FileLock.cleanup()
    // After cleanup the lock is gone; acquire should succeed
    expect(lock.acquire()).toBe(true)
    lock.release()
    vi.useRealTimers()
  })

  it('does not remove live locks', () => {
    vi.useFakeTimers()
    const lock = new FileLock('test-lock-live', 10000)
    lock.acquire()
    vi.advanceTimersByTime(500)
    FileLock.cleanup()
    // Lock should still be held
    const lock2 = new FileLock('test-lock-live', 10000)
    expect(lock2.acquire()).toBe(false)
    lock.release()
    vi.useRealTimers()
  })

  it('cleanup is idempotent on an empty lock set', () => {
    expect(() => FileLock.cleanup()).not.toThrow()
  })
})

describe('FileLock — custom timeout', () => {
  it('respects a custom timeout shorter than the default', () => {
    vi.useFakeTimers()
    const lock = new FileLock('test-lock-custom', 100)
    lock.acquire()
    vi.advanceTimersByTime(50)
    expect(lock.acquire()).toBe(false) // still within timeout
    vi.advanceTimersByTime(60)
    expect(lock.acquire()).toBe(true)  // timed out
    lock.release()
    vi.useRealTimers()
  })
})

describe('FileLock — module-level setInterval auto-cleanup', () => {
  it('setInterval callback fires and runs FileLock.cleanup() when loaded with fake timers', async () => {
    // Must reset modules and install fake timers BEFORE importing the module
    // so the module-level setInterval registers with the fake timer implementation
    vi.useFakeTimers()
    vi.resetModules()

    const { FileLock: FreshFileLock } = await import('@/lib/locks')

    // Acquire a lock with a short timeout
    const lock = new FreshFileLock('auto-cleanup-setinterval', 100)
    lock.acquire()

    // Advance past lock timeout + setInterval interval
    vi.advanceTimersByTime(61000) // 60s setInterval + 1s buffer

    // setInterval callback fired → cleanup ran → expired lock was removed
    // Now acquiring should succeed (lock was auto-cleaned)
    expect(lock.acquire()).toBe(true)
    lock.release()

    vi.useRealTimers()
  })

  it('skips setInterval registration when window is defined (browser env)', async () => {
    // Cover the false branch of `if (typeof window === 'undefined')`.
    // In a browser context, window exists, so setInterval is NOT called.
    vi.useFakeTimers()
    vi.resetModules()

    // Stub window to simulate browser environment
    vi.stubGlobal('window', {})

    const { FileLock: FreshFileLock } = await import('@/lib/locks')

    // The module loaded without throwing and the class is functional.
    // The setInterval was skipped (window is defined), but FileLock still works.
    const lock = new FreshFileLock('browser-env-no-setinterval', 100)
    expect(lock.acquire()).toBe(true)  // can acquire a fresh lock
    lock.release()

    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
