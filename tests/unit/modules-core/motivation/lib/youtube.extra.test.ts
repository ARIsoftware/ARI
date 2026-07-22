/**
 * Extra coverage for motivation/lib/youtube.ts
 *
 * Uncovered branch:
 * - (30, '0', '0'): `typeof raw !== 'string'` branch in extractYouTubeId
 *   (returns null when called with a non-string value)
 * - anonymous_2 (line 88): setTimeout(() => controller.abort()) callback
 *   (only called when the OEMBED fetch times out)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractYouTubeId, fetchYouTubeMetadata } from '@/modules-core/motivation/lib/youtube'

describe('extractYouTubeId — non-string inputs', () => {
  it('returns null when called with a number', () => {
    // @ts-expect-error intentionally passing wrong type
    expect(extractYouTubeId(123)).toBeNull()
  })

  it('returns null when called with null', () => {
    // @ts-expect-error intentionally passing wrong type
    expect(extractYouTubeId(null)).toBeNull()
  })

  it('returns null when called with undefined', () => {
    // @ts-expect-error intentionally passing wrong type
    expect(extractYouTubeId(undefined)).toBeNull()
  })

  it('returns null when called with an object', () => {
    // @ts-expect-error intentionally passing wrong type
    expect(extractYouTubeId({ url: 'https://youtu.be/dQw4w9WgXcQ' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fetchYouTubeMetadata: timeout callback (anonymous_2 at line 88)
// The `setTimeout(() => controller.abort(), ...)` arrow fn fires when the
// fetch takes too long. We use fake timers + an abort-aware fetch mock.
// ---------------------------------------------------------------------------
describe('fetchYouTubeMetadata — timeout fires abort callback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('calls controller.abort() when timeout elapses and returns null metadata', async () => {
    // Mock fetch to reject when the abort signal fires
    vi.stubGlobal('fetch', vi.fn((_url: string, opts?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }
      })
    }))

    const promise = fetchYouTubeMetadata('dQw4w9WgXcQ')
    // Advance timers past OEMBED_TIMEOUT_MS (3000ms) to trigger the abort callback
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise
    // After abort, the fetch rejects and the catch returns null metadata
    expect(result).toEqual({ title: null, channel: null })
  })
})
