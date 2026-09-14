/**
 * Tests for lib/db/ensure-schema.ts
 *
 * The module has two exported functions: ensureSchema() and reapplySchema().
 * Each reads the `pool` singleton and the `setupSql` constant.
 * We mock both dependencies so no real DB queries run.
 *
 * The `ensured` latch inside the module is module-scoped — we use
 * vi.resetModules() between tests to start from a clean state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── shared mock state ──────────────────────────────────────────────────────────

let mockPoolQuery: ReturnType<typeof vi.fn>
let mockEnsureAppGrants: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockPoolQuery = vi.fn().mockResolvedValue({})
  mockEnsureAppGrants = vi.fn().mockResolvedValue(true)
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── helper — load module with controlled pool ──────────────────────────────────

async function loadEnsureSchema(
  pool: { query: ReturnType<typeof vi.fn> } | null
) {
  vi.doMock('@/lib/db/pool', () => ({ pool }))
  vi.doMock('@/lib/db/setup-sql', () => ({ setupSql: '-- test setup sql' }))
  vi.doMock('@/lib/db/app-role', () => ({ ensureAppGrants: mockEnsureAppGrants }))

  return await import('@/lib/db/ensure-schema')
}

// ── ensureSchema ───────────────────────────────────────────────────────────────

describe('ensureSchema', () => {
  it('runs setup SQL against the pool on first call', async () => {
    const { ensureSchema } = await loadEnsureSchema({ query: mockPoolQuery })
    await ensureSchema()
    expect(mockPoolQuery).toHaveBeenCalledWith('-- test setup sql')
  })

  it('does not run SQL a second time (ensured latch)', async () => {
    const { ensureSchema } = await loadEnsureSchema({ query: mockPoolQuery })
    await ensureSchema()
    await ensureSchema()
    expect(mockPoolQuery).toHaveBeenCalledTimes(1)
  })

  it('does nothing when pool is null', async () => {
    const { ensureSchema } = await loadEnsureSchema(null)
    await expect(ensureSchema()).resolves.toBeUndefined()
    expect(mockPoolQuery).not.toHaveBeenCalled()
  })

  it('catches and logs errors without throwing', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPoolQuery.mockRejectedValue(new Error('DB unreachable'))
    const { ensureSchema } = await loadEnsureSchema({ query: mockPoolQuery })
    await expect(ensureSchema()).resolves.toBeUndefined()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to apply lib/db/setup.sql'),
      expect.any(String)
    )
    logSpy.mockRestore()
  })

  it('allows retry after a failure (ensured stays false)', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSuccessSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockPoolQuery
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce({})

    const { ensureSchema } = await loadEnsureSchema({ query: mockPoolQuery })

    // First call fails
    await ensureSchema()
    expect(mockPoolQuery).toHaveBeenCalledTimes(1)

    // Second call should retry
    await ensureSchema()
    expect(mockPoolQuery).toHaveBeenCalledTimes(2)

    logSpy.mockRestore()
    logSuccessSpy.mockRestore()
  })

  it('logs success message on completion', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ensureSchema } = await loadEnsureSchema({ query: mockPoolQuery })
    await ensureSchema()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Schema ensured')
    )
    logSpy.mockRestore()
  })

  it('handles non-Error thrown values', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPoolQuery.mockRejectedValue('string error')
    const { ensureSchema } = await loadEnsureSchema({ query: mockPoolQuery })
    await expect(ensureSchema()).resolves.toBeUndefined()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to apply lib/db/setup.sql'),
      'string error'
    )
    logSpy.mockRestore()
  })
})

// ── reapplySchema ──────────────────────────────────────────────────────────────

describe('reapplySchema', () => {
  it('runs setup SQL and returns true on success', async () => {
    const { reapplySchema } = await loadEnsureSchema({ query: mockPoolQuery })
    const result = await reapplySchema()
    expect(result).toBe(true)
    expect(mockPoolQuery).toHaveBeenCalledWith('-- test setup sql')
  })

  it('returns false when pool is null', async () => {
    const { reapplySchema } = await loadEnsureSchema(null)
    const result = await reapplySchema()
    expect(result).toBe(false)
  })

  it('returns false and logs error on SQL failure', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPoolQuery.mockRejectedValue(new Error('reapply failed'))
    const { reapplySchema } = await loadEnsureSchema({ query: mockPoolQuery })
    const result = await reapplySchema()
    expect(result).toBe(false)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to re-apply lib/db/setup.sql'),
      expect.any(String)
    )
    logSpy.mockRestore()
  })

  it('ignores the ensured latch (always runs SQL)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ensureSchema, reapplySchema } = await loadEnsureSchema({ query: mockPoolQuery })

    // ensureSchema sets the latch
    await ensureSchema()
    expect(mockPoolQuery).toHaveBeenCalledTimes(1)

    // reapplySchema runs again despite the latch
    await reapplySchema()
    expect(mockPoolQuery).toHaveBeenCalledTimes(2)
    logSpy.mockRestore()
  })

  it('logs success message on reapply', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { reapplySchema } = await loadEnsureSchema({ query: mockPoolQuery })
    await reapplySchema()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Schema re-applied')
    )
    logSpy.mockRestore()
  })

  it('sweeps the app role grants after a successful re-apply (tables may have been recreated)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ensureSchema, reapplySchema } = await loadEnsureSchema({ query: mockPoolQuery })
    await ensureSchema()
    expect(mockEnsureAppGrants).not.toHaveBeenCalled() // boot provisions via ensureAppRole instead
    await reapplySchema()
    expect(mockEnsureAppGrants).toHaveBeenCalledTimes(1)
    logSpy.mockRestore()
  })

  it('does not sweep grants when the re-apply failed', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPoolQuery.mockRejectedValue(new Error('reapply failed'))
    const { reapplySchema } = await loadEnsureSchema({ query: mockPoolQuery })
    expect(await reapplySchema()).toBe(false)
    expect(mockEnsureAppGrants).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('handles non-Error thrown values in reapplySchema', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPoolQuery.mockRejectedValue(42)
    const { reapplySchema } = await loadEnsureSchema({ query: mockPoolQuery })
    const result = await reapplySchema()
    expect(result).toBe(false)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to re-apply lib/db/setup.sql'),
      '42'
    )
    logSpy.mockRestore()
  })
})
