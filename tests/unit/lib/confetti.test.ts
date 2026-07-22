/**
 * Tests for lib/confetti.ts
 *
 * schoolPride() uses canvas-confetti and requestAnimationFrame (browser APIs).
 * We stub both to exercise the pure logic in node.
 *
 * Animation loop structure (in confetti.ts):
 *   const end = Date.now() + 8000
 *   const frame = () => {
 *     confetti(...)  // left
 *     confetti(...)  // right
 *     if (Date.now() < end) requestAnimationFrame(frame)
 *   }
 *   frame()  // kick off
 *
 * Key branches:
 *   A) Date.now() < end  → rAF is called to continue the loop
 *   B) Date.now() >= end → rAF is NOT called (loop ends)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// ── Stub canvas-confetti ───────────────────────────────────────────────────────

const mockConfetti = vi.fn()

vi.mock('canvas-confetti', () => ({
  default: (...args: unknown[]) => mockConfetti(...args),
}))

import { schoolPride } from '@/lib/confetti'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mockConfetti.mockReset()
})

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Stub requestAnimationFrame to call cb exactly `maxFrames` times synchronously
 * (prevents infinite recursion while driving multiple frames).
 */
function stubRaf(maxFrames: number) {
  let remaining = maxFrames
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (remaining > 0) {
      remaining--
      cb(0)
    }
    return 0
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('schoolPride — first frame fires both cannons', () => {
  it('calls confetti at least twice (left + right)', () => {
    // rAF does nothing so only the initial frame() call runs
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    schoolPride()
    expect(mockConfetti.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('first confetti call uses angle 60 (left cannon)', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    schoolPride()
    const first = mockConfetti.mock.calls[0][0] as Record<string, unknown>
    expect(first.angle).toBe(60)
    expect(first.origin).toEqual({ x: 0, y: 0.6 })
  })

  it('second confetti call uses angle 120 (right cannon)', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    schoolPride()
    const second = mockConfetti.mock.calls[1][0] as Record<string, unknown>
    expect(second.angle).toBe(120)
    expect(second.origin).toEqual({ x: 1, y: 0.6 })
  })

  it('each confetti call uses particleCount 3', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    schoolPride()
    for (const call of mockConfetti.mock.calls) {
      const opts = call[0] as Record<string, unknown>
      expect(opts.particleCount).toBe(3)
    }
  })

  it('confetti colors include blue and white', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    schoolPride()
    const colors = (mockConfetti.mock.calls[0][0] as Record<string, unknown>).colors
    expect(colors).toEqual(['#0035ba', '#ffffff'])
  })

  it('spread is 55', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    schoolPride()
    const opts = mockConfetti.mock.calls[0][0] as Record<string, unknown>
    expect(opts.spread).toBe(55)
  })
})

describe('schoolPride — loop continuation (Date.now() < end)', () => {
  it('requests an animation frame when still within the 8-second window', () => {
    const rafSpy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    // Date.now() is the real value — well within the 8s window
    schoolPride()
    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(rafSpy).toHaveBeenCalledWith(expect.any(Function))
  })

  it('runs multiple frames when rAF fires synchronously for a limited count', () => {
    // Allow exactly 2 extra frames after the initial one
    stubRaf(2)
    schoolPride()
    // Initial frame: 2 calls; frame 2: 2 calls; frame 3: 2 calls → 6 total
    expect(mockConfetti.mock.calls.length).toBe(6)
  })
})

describe('schoolPride — loop termination (Date.now() >= end)', () => {
  it('does NOT call requestAnimationFrame when the deadline has passed', () => {
    const rafSpy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rafSpy)

    // Set Date.now() to 9 seconds past the epoch-relative start
    // The function captures `end = Date.now() + 8000` when called.
    // If we make Date.now() return a very large value, the check `Date.now() < end`
    // will be false immediately after the first frame.
    //
    // Sequence:
    //   1. schoolPride() captures end = T + 8000  (first Date.now() call)
    //   2. frame() fires: confetti×2, then checks Date.now() < end
    //      We return T + 9000 for this check → false → rAF not called

    let callCount = 0
    const base = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++
      if (callCount === 1) return base        // first call: sets `end`
      return base + 9000                      // subsequent calls: past deadline
    })

    schoolPride()

    // confetti fired twice (one frame)
    expect(mockConfetti.mock.calls.length).toBe(2)
    // rAF was NOT called because the deadline was already past
    expect(rafSpy).not.toHaveBeenCalled()
  })
})
