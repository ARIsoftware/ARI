/**
 * Tests for lib/telemetry/send-tv-connect.ts
 *
 * sendTvConnect() is fire-and-forget — it must never throw. It:
 *  - Returns early if instance is null or telemetry is disabled
 *  - Returns early if event=ari_started but first_signin_pinged=false
 *  - Optionally fetches the user email from the DB
 *  - POSTs to MODULES_API_BASE/tv/connect with a 5s timeout
 *  - Swallows ALL errors silently
 *
 * We mock fetch globally and mock the dependencies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── mock state ─────────────────────────────────────────────────────────────────

let mockGetAriInstance: ReturnType<typeof vi.fn>
let mockPoolQuery: ReturnType<typeof vi.fn>
let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  mockGetAriInstance = vi.fn()
  mockPoolQuery = vi.fn()
  mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function loadSendTv(
  instance: { id: string; telemetryEnabled: boolean; firstSigninPinged: boolean } | null,
  pool: { query: ReturnType<typeof vi.fn> } | null
) {
  mockGetAriInstance.mockResolvedValue(instance)
  vi.doMock('@/lib/telemetry/instance', () => ({
    getAriInstance: mockGetAriInstance,
  }))
  vi.doMock('@/lib/db/pool', () => ({ pool }))
  return await import('@/lib/telemetry/send-tv-connect')
}

const ENABLED_INSTANCE = {
  id: 'inst-abc',
  telemetryEnabled: true,
  firstSigninPinged: true,
}

const DISABLED_INSTANCE = {
  id: 'inst-xyz',
  telemetryEnabled: false,
  firstSigninPinged: true,
}

// ── early-exit branches ────────────────────────────────────────────────────────

describe('sendTvConnect — early exits', () => {
  it('does nothing when getAriInstance returns null', async () => {
    const { sendTvConnect } = await loadSendTv(null, null)
    await sendTvConnect()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does nothing when telemetry is disabled', async () => {
    const { sendTvConnect } = await loadSendTv(DISABLED_INSTANCE, null)
    await sendTvConnect()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does nothing for ari_started when first_signin_pinged=false', async () => {
    const { sendTvConnect } = await loadSendTv(
      { ...ENABLED_INSTANCE, firstSigninPinged: false },
      null
    )
    await sendTvConnect({ event: 'ari_started' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends first_login even when firstSigninPinged=false', async () => {
    const { sendTvConnect } = await loadSendTv(
      { ...ENABLED_INSTANCE, firstSigninPinged: false },
      null
    )
    await sendTvConnect({ event: 'first_login', username: 'user@example.com' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

// ── payload construction ───────────────────────────────────────────────────────

describe('sendTvConnect — payload', () => {
  it('sends correct JSON payload for ari_started', async () => {
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await sendTvConnect({ event: 'ari_started', username: 'test@example.com' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/tv/connect')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(opts.body)
    expect(body.instance_id).toBe('inst-abc')
    expect(body.event).toBe('ari_started')
    expect(body.username).toBe('test@example.com')
    expect(body.platform).toMatch(/darwin|linux|windows/)
    expect(typeof body.timestamp).toBe('string')
  })

  it('defaults event to ari_started when not provided', async () => {
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.event).toBe('ari_started')
  })

  it('sends first_login event correctly', async () => {
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await sendTvConnect({ event: 'first_login', username: 'hello@ari.software' })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.event).toBe('first_login')
    expect(body.username).toBe('hello@ari.software')
  })

  it('includes ari_version from env var', async () => {
    process.env.NEXT_PUBLIC_ARI_VERSION = '2.5.0'
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.ari_version).toBe('2.5.0')
    delete process.env.NEXT_PUBLIC_ARI_VERSION
  })

  it('defaults ari_version to 0.0.0 when env var is missing', async () => {
    delete process.env.NEXT_PUBLIC_ARI_VERSION
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.ari_version).toBe('0.0.0')
  })
})

// ── username resolution from DB ────────────────────────────────────────────────

describe('sendTvConnect — username fallback from DB', () => {
  it('fetches username from user table when not provided', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ email: 'db@example.com' }] })
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, { query: mockPoolQuery })
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.username).toBe('db@example.com')
  })

  it('uses empty string when user table has no rows', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, { query: mockPoolQuery })
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.username).toBe('')
  })

  it('uses empty string when pool.query throws (user table may not exist)', async () => {
    mockPoolQuery.mockRejectedValue(new Error('relation "user" does not exist'))
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, { query: mockPoolQuery })
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.username).toBe('')
  })

  it('uses provided username even when pool exists', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ email: 'should-not-be-used@example.com' }] })
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, { query: mockPoolQuery })
    await sendTvConnect({ username: 'explicit@example.com' })

    // Query should NOT be called since username was provided
    expect(mockPoolQuery).not.toHaveBeenCalled()
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.username).toBe('explicit@example.com')
  })

  it('uses empty string for null email in user row', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ email: null }] })
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, { query: mockPoolQuery })
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.username).toBe('')
  })

  it('does not fetch username when pool is null', async () => {
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await sendTvConnect()

    // fetch should still be called but username is ''
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.username).toBe('')
  })
})

// ── network error handling ─────────────────────────────────────────────────────

describe('sendTvConnect — error handling (never throws)', () => {
  it('does not throw when fetch fails with a network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await expect(sendTvConnect()).resolves.toBeUndefined()
  })

  it('does not throw when fetch is aborted by timeout', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)
    await expect(sendTvConnect()).resolves.toBeUndefined()
  })

  it('does not throw when getAriInstance throws', async () => {
    mockGetAriInstance.mockRejectedValue(new Error('DB gone'))
    vi.doMock('@/lib/telemetry/instance', () => ({ getAriInstance: mockGetAriInstance }))
    vi.doMock('@/lib/db/pool', () => ({ pool: null }))
    const { sendTvConnect } = await import('@/lib/telemetry/send-tv-connect')
    await expect(sendTvConnect()).resolves.toBeUndefined()
  })

  it('timeout abort callback fires and aborts the request', async () => {
    // Use fake timers to control setTimeout
    vi.useFakeTimers()

    let abortController: AbortController | null = null
    const abortSpy = vi.fn()

    // Fetch captures the abort signal; we spy to verify abort was called
    mockFetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      const signal = opts.signal as AbortSignal
      abortController = new AbortController()
      signal.addEventListener('abort', () => {
        abortSpy()
        abortController!.abort()
      })
      // Return a promise that resolves when the abort fires
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
        )
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { sendTvConnect } = await loadSendTv(ENABLED_INSTANCE, null)

    // Start the call — it will hang on fetch
    const promise = sendTvConnect()

    // Advance past the 5s timeout to trigger () => controller.abort()
    await vi.advanceTimersByTimeAsync(5100)

    // The abort should have been called
    expect(abortSpy).toHaveBeenCalled()

    // The error is swallowed — sendTvConnect resolves without throwing
    await expect(promise).resolves.toBeUndefined()

    vi.useRealTimers()
  })
})

// ── PLATFORM constant — process.platform branches ─────────────────────────────
// The module-level PLATFORM const evaluates process.platform at import time.
// To cover the win32 and linux branches we reset modules and stub the platform.

describe('PLATFORM — process.platform branch coverage', () => {
  it('resolves to windows when process.platform is win32', async () => {
    vi.resetModules()
    const origPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

    mockGetAriInstance = vi.fn().mockResolvedValue(ENABLED_INSTANCE)
    mockPoolQuery = vi.fn().mockResolvedValue({ rows: [] })
    mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    vi.doMock('@/lib/telemetry/instance', () => ({ getAriInstance: mockGetAriInstance }))
    vi.doMock('@/lib/db/pool', () => ({ pool: null }))

    const { sendTvConnect } = await import('@/lib/telemetry/send-tv-connect')
    await sendTvConnect()

    // fetch was called and payload platform = 'windows'
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.platform).toBe('windows')

    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true })
  })

  it('resolves to linux when process.platform is linux', async () => {
    vi.resetModules()
    const origPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

    mockGetAriInstance = vi.fn().mockResolvedValue(ENABLED_INSTANCE)
    mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    vi.doMock('@/lib/telemetry/instance', () => ({ getAriInstance: mockGetAriInstance }))
    vi.doMock('@/lib/db/pool', () => ({ pool: null }))

    const { sendTvConnect } = await import('@/lib/telemetry/send-tv-connect')
    await sendTvConnect()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.platform).toBe('linux')

    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true })
  })
})
