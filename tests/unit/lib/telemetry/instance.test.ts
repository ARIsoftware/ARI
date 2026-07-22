/**
 * Tests for lib/telemetry/instance.ts
 *
 * Covers getAriInstance(), setTelemetryEnabled(), tryClaimFirstSigninPing().
 * All pool queries are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockQuery: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  mockQuery = vi.fn()
})

async function loadInstance(pool: { query: ReturnType<typeof vi.fn> } | null) {
  vi.doMock('@/lib/db/pool', () => ({ pool }))
  return await import('@/lib/telemetry/instance')
}

// ── getAriInstance ─────────────────────────────────────────────────────────────

describe('getAriInstance', () => {
  it('returns null when pool is null', async () => {
    const { getAriInstance } = await loadInstance(null)
    const result = await getAriInstance()
    expect(result).toBeNull()
  })

  it('returns mapped AriInstance when row exists', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 'inst-1', telemetry_enabled: true, first_signin_pinged: false }],
    })
    const { getAriInstance } = await loadInstance({ query: mockQuery })
    const result = await getAriInstance()

    expect(result).toEqual({
      id: 'inst-1',
      telemetryEnabled: true,
      firstSigninPinged: false,
    })
  })

  it('inserts a row when none exists and returns the inserted row', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT returns empty
      .mockResolvedValueOnce({
        rows: [{ id: 'new-inst', telemetry_enabled: true, first_signin_pinged: false }],
      }) // INSERT RETURNING

    const { getAriInstance } = await loadInstance({ query: mockQuery })
    const result = await getAriInstance()

    expect(result).toEqual({
      id: 'new-inst',
      telemetryEnabled: true,
      firstSigninPinged: false,
    })
    // Should have called query twice: SELECT then INSERT
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('returns null on DB error (catch branch)', async () => {
    mockQuery.mockRejectedValue(new Error('connection error'))
    const { getAriInstance } = await loadInstance({ query: mockQuery })
    const result = await getAriInstance()
    expect(result).toBeNull()
  })

  it('maps firstSigninPinged=true correctly', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 'inst-2', telemetry_enabled: false, first_signin_pinged: true }],
    })
    const { getAriInstance } = await loadInstance({ query: mockQuery })
    const result = await getAriInstance()
    expect(result?.firstSigninPinged).toBe(true)
    expect(result?.telemetryEnabled).toBe(false)
  })
})

// ── setTelemetryEnabled ────────────────────────────────────────────────────────

describe('setTelemetryEnabled', () => {
  it('does nothing when pool is null', async () => {
    const { setTelemetryEnabled } = await loadInstance(null)
    await expect(setTelemetryEnabled(true)).resolves.toBeUndefined()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('calls pool.query with enabled=true', async () => {
    mockQuery.mockResolvedValue({})
    const { setTelemetryEnabled } = await loadInstance({ query: mockQuery })
    await setTelemetryEnabled(true)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('telemetry_enabled'),
      [true]
    )
  })

  it('calls pool.query with enabled=false', async () => {
    mockQuery.mockResolvedValue({})
    const { setTelemetryEnabled } = await loadInstance({ query: mockQuery })
    await setTelemetryEnabled(false)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('telemetry_enabled'),
      [false]
    )
  })
})

// ── tryClaimFirstSigninPing ────────────────────────────────────────────────────

describe('tryClaimFirstSigninPing', () => {
  it('returns false when pool is null', async () => {
    const { tryClaimFirstSigninPing } = await loadInstance(null)
    const result = await tryClaimFirstSigninPing()
    expect(result).toBe(false)
  })

  it('returns true when UPDATE changes a row (wins the race)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'inst-1' }] })
    const { tryClaimFirstSigninPing } = await loadInstance({ query: mockQuery })
    const result = await tryClaimFirstSigninPing()
    expect(result).toBe(true)
  })

  it('returns false when UPDATE changes no rows (already pinged)', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const { tryClaimFirstSigninPing } = await loadInstance({ query: mockQuery })
    const result = await tryClaimFirstSigninPing()
    expect(result).toBe(false)
  })

  it('returns false on DB error (catch branch)', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'))
    const { tryClaimFirstSigninPing } = await loadInstance({ query: mockQuery })
    const result = await tryClaimFirstSigninPing()
    expect(result).toBe(false)
  })
})
