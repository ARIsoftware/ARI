/**
 * Tests for lib/db/index.ts
 *
 * Covers: withUserContext(), withAdminDb(), getPoolClient(), closePool(),
 * pgBouncerCompat (named statement stripping), isStaleConnectionError (retry logic).
 *
 * We mock `pg` and `drizzle-orm/node-postgres` to avoid real DB calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock state ──────────────────────────────────────────────────────────

let mockPoolConnect: ReturnType<typeof vi.fn>
let mockPoolEnd: ReturnType<typeof vi.fn>
let mockDrizzleInstance: { select: ReturnType<typeof vi.fn> }

// ── app pool mock (Phase 3): null = privileged pool, object = app pool ─────────
let appPoolHolder: { pool: { connect: ReturnType<typeof vi.fn> } | null }
let mockNoteAppPoolConnectFailure: ReturnType<typeof vi.fn>
let mockNoteAppPoolServed: ReturnType<typeof vi.fn>
let mockNoteFallback: ReturnType<typeof vi.fn>
let mockNoteGrantMissRetry: ReturnType<typeof vi.fn>
let mockCloseAppPool: ReturnType<typeof vi.fn>
let mockEnsureAppGrants: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  mockPoolConnect = vi.fn()
  mockPoolEnd = vi.fn().mockResolvedValue(undefined)
  mockDrizzleInstance = { select: vi.fn() }
  appPoolHolder = { pool: null }
  mockNoteAppPoolConnectFailure = vi.fn()
  mockNoteAppPoolServed = vi.fn()
  mockNoteFallback = vi.fn()
  mockNoteGrantMissRetry = vi.fn()
  mockCloseAppPool = vi.fn().mockResolvedValue(undefined)
  mockEnsureAppGrants = vi.fn().mockResolvedValue(true)
})

// ── Load helpers ───────────────────────────────────────────────────────────────

async function loadDbIndex(pool: object | null) {
  vi.doMock('@/lib/db/pool', () => ({ pool }))
  vi.doMock('drizzle-orm/node-postgres', () => ({
    drizzle: vi.fn(() => mockDrizzleInstance),
  }))
  vi.doMock('@/lib/db/app-pool', () => ({
    getAppPoolIfHealthy: vi.fn(async () => appPoolHolder.pool),
    noteAppPoolConnectFailure: mockNoteAppPoolConnectFailure,
    noteAppPoolServed: mockNoteAppPoolServed,
    noteFallback: mockNoteFallback,
    noteGrantMissRetry: mockNoteGrantMissRetry,
    closeAppPool: mockCloseAppPool,
  }))
  vi.doMock('@/lib/db/app-role', () => ({ ensureAppGrants: mockEnsureAppGrants }))
  return await import('@/lib/db/index')
}

// Creates a client where pgBouncerCompat is transparent (no named statements)
function makeRawClient(overrides: {
  query?: (q: any, ...args: any[]) => Promise<any>
  release?: (...args: any[]) => void
} = {}) {
  const release = overrides.release ?? vi.fn()
  const queryFn = overrides.query ?? (async () => ({ rows: [] }))
  return {
    query: queryFn,
    release,
    // track release calls on the object
    _release: release,
  }
}

// ── withUserContext ────────────────────────────────────────────────────────────

describe('withUserContext', () => {
  it('throws when pool is null', async () => {
    const { withUserContext } = await loadDbIndex(null)
    await expect(withUserContext('user1', async (db) => db)).rejects.toThrow('Database pool not initialized')
  })

  it('executes the operation inside BEGIN/COMMIT transaction', async () => {
    const queryCalls: string[] = []
    const release = vi.fn()
    const client = makeRawClient({
      query: async (q: any) => {
        queryCalls.push(typeof q === 'string' ? q : q.text ?? JSON.stringify(q))
        return { rows: [] }
      },
      release,
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    const result = await withUserContext('user1', async (db) => 'ok')

    expect(queryCalls).toContain('BEGIN')
    expect(queryCalls.some(q => q.includes("SET LOCAL app.current_user_id = 'user1'"))).toBe(true)
    expect(queryCalls).toContain('COMMIT')
    expect(result).toBe('ok')
    expect(release).toHaveBeenCalled()
  })

  it('sets app.current_user_role in the same round trip when a role is given', async () => {
    const queryCalls: string[] = []
    const client = makeRawClient({
      query: async (q: any) => {
        queryCalls.push(typeof q === 'string' ? q : '')
        return { rows: [] }
      },
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await withUserContext('user1', async () => 'ok', 'admin')

    const setLocalCall = queryCalls.find(q => q.includes('SET LOCAL'))
    expect(setLocalCall).toBe(
      "SET LOCAL app.current_user_id = 'user1'; SET LOCAL app.current_user_role = 'admin'"
    )
  })

  it('omits app.current_user_role when no role is given', async () => {
    const queryCalls: string[] = []
    const client = makeRawClient({
      query: async (q: any) => {
        queryCalls.push(typeof q === 'string' ? q : '')
        return { rows: [] }
      },
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await withUserContext('user1', async () => 'ok')

    const setLocalCall = queryCalls.find(q => q.includes('SET LOCAL'))
    expect(setLocalCall).not.toContain('app.current_user_role')
  })

  it('escapes single quotes in the role', async () => {
    const queryCalls: string[] = []
    const client = makeRawClient({
      query: async (q: any) => {
        queryCalls.push(typeof q === 'string' ? q : '')
        return { rows: [] }
      },
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await withUserContext('user1', async () => 'ok', "adm'in")

    const setLocalCall = queryCalls.find(q => q.includes('current_user_role'))
    expect(setLocalCall).toContain("adm''in")
  })

  it('escapes single quotes in userId to prevent SQL injection', async () => {
    const queryCalls: string[] = []
    const client = makeRawClient({
      query: async (q: any) => {
        queryCalls.push(typeof q === 'string' ? q : '')
        return { rows: [] }
      },
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await withUserContext("user'with'quotes", async () => 'ok')

    const setLocalCall = queryCalls.find(q => q.includes('SET LOCAL'))
    expect(setLocalCall).toContain("user''with''quotes")
  })

  it('releases client back to pool after success', async () => {
    const release = vi.fn()
    mockPoolConnect.mockResolvedValue(makeRawClient({ release }))
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await withUserContext('user1', async () => 'ok')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('rolls back and releases client on operation error', async () => {
    const queryCalls: string[] = []
    const release = vi.fn()
    const client = makeRawClient({
      query: async (q: any) => {
        queryCalls.push(typeof q === 'string' ? q : '')
        return { rows: [] }
      },
      release,
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await expect(
      withUserContext('user1', async () => { throw new Error('op failed') })
    ).rejects.toThrow('op failed')

    expect(queryCalls).toContain('ROLLBACK')
    expect(release).toHaveBeenCalled()
  })

  it('retries once on stale connection error after BEGIN', async () => {
    const staleRelease = vi.fn()
    let staleCallCount = 0
    const staleClient = makeRawClient({
      query: async (q: any) => {
        staleCallCount++
        if (staleCallCount === 1) {
          // BEGIN throws a stale error
          throw new Error('Connection terminated unexpectedly')
        }
        return { rows: [] }
      },
      release: staleRelease,
    })

    const goodRelease = vi.fn()
    const goodClient = makeRawClient({ release: goodRelease })
    const op = vi.fn().mockResolvedValue('result')

    mockPoolConnect
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(goodClient)

    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    const result = await withUserContext('user1', op)
    expect(result).toBe('result')
    // Stale client released with destroy flag
    expect(staleRelease).toHaveBeenCalledWith(true)
    // Good client was released normally
    expect(goodRelease).toHaveBeenCalled()
  })

  it('does NOT retry on non-stale errors', async () => {
    let callCount = 0
    const client = makeRawClient({
      query: async (q: any) => {
        callCount++
        return { rows: [] }
      },
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await expect(
      withUserContext('user1', async (db) => { throw new Error('unique constraint violation') })
    ).rejects.toThrow('unique constraint violation')

    expect(mockPoolConnect).toHaveBeenCalledTimes(1)
  })

  it('retries on "connection is closed" error', async () => {
    const staleRelease = vi.fn()
    let count = 0
    const staleClient = makeRawClient({
      query: async () => {
        if (++count === 1) throw new Error('connection is closed')
        return { rows: [] }
      },
      release: staleRelease,
    })
    const goodClient = makeRawClient()

    mockPoolConnect
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(goodClient)

    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await expect(withUserContext('user1', async () => 'ok')).resolves.toBe('ok')
    expect(staleRelease).toHaveBeenCalledWith(true)
    expect(mockPoolConnect).toHaveBeenCalledTimes(2)
  })

  it('retries on "Client has encountered a connection error"', async () => {
    const staleRelease = vi.fn()
    let count = 0
    const staleClient = makeRawClient({
      query: async () => {
        if (++count === 1) throw new Error('Client has encountered a connection error')
        return { rows: [] }
      },
      release: staleRelease,
    })
    const goodClient = makeRawClient()

    mockPoolConnect
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(goodClient)

    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await expect(withUserContext('user1', async () => 'ok')).resolves.toBe('ok')
    expect(mockPoolConnect).toHaveBeenCalledTimes(2)
  })

  it('retries on "Connection terminated due to connection timeout"', async () => {
    const staleRelease = vi.fn()
    let count = 0
    const staleClient = makeRawClient({
      query: async () => {
        if (++count === 1) throw new Error('Connection terminated due to connection timeout')
        return { rows: [] }
      },
      release: staleRelease,
    })
    const goodClient = makeRawClient()

    mockPoolConnect
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(goodClient)

    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await expect(withUserContext('user1', async () => 'ok')).resolves.toBe('ok')
    expect(mockPoolConnect).toHaveBeenCalledTimes(2)
  })

  it('swallows rollback errors on dead connections', async () => {
    const staleRelease = vi.fn()
    const count = 0
    const staleClient = makeRawClient({
      query: async () => {
        // All queries (including ROLLBACK) fail with stale error
        throw new Error('connection is closed')
      },
      release: staleRelease,
    })
    const goodClient = makeRawClient()

    mockPoolConnect
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(goodClient)

    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    // Should succeed with retry even though ROLLBACK also fails
    await expect(withUserContext('user1', async () => 'ok')).resolves.toBe('ok')
  })

  it('throws stale error when pool.connect() throws (client stays null)', async () => {
    // pool.connect() itself throws — client is never assigned
    mockPoolConnect.mockRejectedValue(new Error('connection is closed'))
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    // First attempt: pool.connect() throws (isStale=true) → retry
    // Second attempt: pool.connect() throws again → re-throw
    await expect(withUserContext('user1', async () => 'ok')).rejects.toThrow('connection is closed')
    expect(mockPoolConnect).toHaveBeenCalledTimes(2)
  })

  it('isStaleConnectionError returns false for error with no message property', async () => {
    // Covers the `error?.message || ''` fallback branch
    // This error has no message → isStaleConnectionError returns false → throw
    mockPoolConnect.mockResolvedValue(makeRawClient())
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    const noMessageError = { code: 'SOME_CODE' } // no message property
    await expect(
      withUserContext('user1', async () => { throw noMessageError })
    ).rejects.toBe(noMessageError)
    // Should not retry (not a stale error)
    expect(mockPoolConnect).toHaveBeenCalledTimes(1)
  })
})

// ── pgBouncerCompat — named statement stripping ────────────────────────────────

describe('pgBouncerCompat — named statement stripping', () => {
  it('strips the name property when operation calls client.query with a named config', async () => {
    const receivedQueryArgs: any[] = []
    const client = makeRawClient({
      query: async (...args: any[]) => {
        receivedQueryArgs.push(args[0])
        return { rows: [] }
      },
    })
    mockPoolConnect.mockResolvedValue(client)

    // Make drizzle() call the underlying client with a named query object
    let capturedClient: any = null
    vi.doMock('@/lib/db/pool', () => ({ pool: { connect: mockPoolConnect, end: mockPoolEnd } }))
    vi.doMock('drizzle-orm/node-postgres', () => ({
      drizzle: (rawClient: any) => {
        capturedClient = rawClient
        return { _drizzle: true }
      },
    }))
    const { withUserContext } = await import('@/lib/db/index')

    await withUserContext('user1', async (db) => {
      // Use the patched client directly to send a named statement
      // (this simulates what drizzle does internally with prepared statements)
      if (capturedClient) {
        await capturedClient.query({ text: 'SELECT $1::int', name: 'my-prepared-stmt', values: [1] })
      }
      return 'ok'
    })

    // The named config should have had its 'name' stripped
    const namedCall = receivedQueryArgs.find(
      (a: any) => typeof a === 'object' && a !== null && 'text' in a
    )
    expect(namedCall).toBeDefined()
    expect(namedCall.name).toBeUndefined()
    expect(namedCall.text).toBe('SELECT $1::int')
  })

  it('passes non-object queries through unchanged', async () => {
    const receivedArgs: any[] = []
    const client = makeRawClient({
      query: async (...args: any[]) => {
        receivedArgs.push(args[0])
        return { rows: [] }
      },
    })
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await withUserContext('user1', async () => 'ok')
    // String queries should pass through as-is
    expect(receivedArgs).toContain('BEGIN')
    expect(receivedArgs).toContain('COMMIT')
  })
})

// ── withAdminDb ────────────────────────────────────────────────────────────────

describe('withAdminDb', () => {
  it('throws when pool is null', async () => {
    const { withAdminDb } = await loadDbIndex(null)
    await expect(withAdminDb(async (db) => db)).rejects.toThrow('Database pool not initialized')
  })

  it('executes the operation and returns result', async () => {
    mockPoolConnect.mockResolvedValue(makeRawClient())
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withAdminDb } = await loadDbIndex(pool)

    const result = await withAdminDb(async (db) => 'admin-result')
    expect(result).toBe('admin-result')
  })

  it('releases the client after successful operation', async () => {
    const release = vi.fn()
    mockPoolConnect.mockResolvedValue(makeRawClient({ release }))
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withAdminDb } = await loadDbIndex(pool)

    await withAdminDb(async () => 'ok')
    expect(release).toHaveBeenCalled()
  })

  it('retries once on stale connection error', async () => {
    const staleRelease = vi.fn()
    const staleClient = makeRawClient({ release: staleRelease })
    const goodRelease = vi.fn()
    const goodClient = makeRawClient({ release: goodRelease })

    mockPoolConnect
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(goodClient)

    const op = vi.fn()
      .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
      .mockResolvedValueOnce('admin-ok')

    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withAdminDb } = await loadDbIndex(pool)

    const result = await withAdminDb(op)
    expect(result).toBe('admin-ok')
    expect(staleRelease).toHaveBeenCalledWith(true)
    expect(goodRelease).toHaveBeenCalled()
  })

  it('does NOT retry on non-stale errors', async () => {
    mockPoolConnect.mockResolvedValue(makeRawClient())
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withAdminDb } = await loadDbIndex(pool)

    await expect(
      withAdminDb(async () => { throw new Error('permission denied') })
    ).rejects.toThrow('permission denied')

    expect(mockPoolConnect).toHaveBeenCalledTimes(1)
  })

  it('swallows release() errors gracefully in finally', async () => {
    const release = vi.fn().mockImplementation(() => { throw new Error('release failed') })
    mockPoolConnect.mockResolvedValue(makeRawClient({ release }))
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withAdminDb } = await loadDbIndex(pool)

    // Should not throw despite release() throwing
    await expect(withAdminDb(async () => 'ok')).resolves.toBe('ok')
  })

  it('retries on "connection is closed" error in withAdminDb', async () => {
    const staleRelease = vi.fn()
    const staleClient = makeRawClient({ release: staleRelease })
    const goodClient = makeRawClient()

    mockPoolConnect
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(goodClient)

    const op = vi.fn()
      .mockRejectedValueOnce(new Error('connection is closed'))
      .mockResolvedValueOnce('ok')

    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withAdminDb } = await loadDbIndex(pool)

    await expect(withAdminDb(op)).resolves.toBe('ok')
    expect(staleRelease).toHaveBeenCalledWith(true)
  })
})

// ── getPoolClient ──────────────────────────────────────────────────────────────

describe('getPoolClient', () => {
  it('throws when pool is null', async () => {
    const { getPoolClient } = await loadDbIndex(null)
    await expect(getPoolClient()).rejects.toThrow('Database pool not initialized')
  })

  it('returns a pool client when pool is initialized', async () => {
    const client = makeRawClient()
    mockPoolConnect.mockResolvedValue(client)
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { getPoolClient } = await loadDbIndex(pool)

    const result = await getPoolClient()
    expect(result).toBe(client)
  })
})

// ── closePool ──────────────────────────────────────────────────────────────────

describe('closePool', () => {
  it('calls pool.end() when pool exists', async () => {
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { closePool } = await loadDbIndex(pool)

    await closePool()
    expect(mockPoolEnd).toHaveBeenCalledTimes(1)
  })

  it('does nothing when pool is null', async () => {
    const { closePool } = await loadDbIndex(null)
    await expect(closePool()).resolves.toBeUndefined()
  })

  it('closes the app pool as well', async () => {
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { closePool } = await loadDbIndex(pool)
    await closePool()
    expect(mockCloseAppPool).toHaveBeenCalledTimes(1)
  })
})

// ── withUserContext — app pool (DB-level RLS enforcement) ─────────────────────

describe('withUserContext — app pool selection', () => {
  function recordingClient(release = vi.fn()) {
    const calls: string[] = []
    const client = makeRawClient({
      query: async (q: any) => {
        calls.push(typeof q === 'string' ? q : (q?.text ?? ''))
        return { rows: [] }
      },
      release,
    })
    return { client, calls, release }
  }

  it('runs on the app pool when it is healthy and arms app.enforced in the same round trip', async () => {
    const app = recordingClient()
    const appConnect = vi.fn().mockResolvedValue(app.client)
    appPoolHolder.pool = { connect: appConnect }
    const pool = { connect: mockPoolConnect, end: mockPoolEnd }
    const { withUserContext } = await loadDbIndex(pool)

    await expect(withUserContext('user1', async () => 'ok', 'admin')).resolves.toBe('ok')

    expect(appConnect).toHaveBeenCalledTimes(1)
    expect(mockPoolConnect).not.toHaveBeenCalled()
    expect(app.calls.find((q) => q.includes('SET LOCAL'))).toBe(
      "SET LOCAL app.current_user_id = 'user1'; SET LOCAL app.current_user_role = 'admin'; SET LOCAL app.enforced = 'on'"
    )
    expect(app.calls).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']))
    expect(app.release).toHaveBeenCalledTimes(1)
    expect(mockNoteFallback).not.toHaveBeenCalled()
    expect(mockNoteAppPoolServed).toHaveBeenCalledWith('user1')
  })

  it('appends app.enforced after the user id when no role is given', async () => {
    const app = recordingClient()
    appPoolHolder.pool = { connect: vi.fn().mockResolvedValue(app.client) }
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    await withUserContext('user1', async () => 'ok')
    expect(app.calls.find((q) => q.includes('SET LOCAL'))).toBe(
      "SET LOCAL app.current_user_id = 'user1'; SET LOCAL app.enforced = 'on'"
    )
  })

  it('never sets app.enforced on the privileged pool and counts the fallback', async () => {
    const priv = recordingClient()
    mockPoolConnect.mockResolvedValue(priv.client)
    appPoolHolder.pool = null
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    await withUserContext('user1', async () => 'ok', 'admin')
    expect(priv.calls.find((q) => q.includes('SET LOCAL'))).toBe(
      "SET LOCAL app.current_user_id = 'user1'; SET LOCAL app.current_user_role = 'admin'"
    )
    expect(priv.calls.some((q) => q.includes('app.enforced'))).toBe(false)
    expect(mockNoteFallback).toHaveBeenCalledTimes(1)
    expect(mockNoteFallback).toHaveBeenCalledWith('user1')
    expect(mockNoteAppPoolServed).not.toHaveBeenCalled()
  })

  it('falls back to the privileged pool for this call when the app pool connect fails', async () => {
    const authErr = Object.assign(new Error('password authentication failed for user "ari_app"'), {
      code: '28P01',
    })
    appPoolHolder.pool = { connect: vi.fn().mockRejectedValue(authErr) }
    const priv = recordingClient()
    mockPoolConnect.mockResolvedValue(priv.client)
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })

    await expect(withUserContext('user1', async () => 'ok')).resolves.toBe('ok')

    expect(mockNoteAppPoolConnectFailure).toHaveBeenCalledWith(authErr, 'user1')
    expect(mockPoolConnect).toHaveBeenCalledTimes(1)
    expect(priv.calls.some((q) => q.includes('app.enforced'))).toBe(false)
    expect(mockNoteFallback).not.toHaveBeenCalled() // counted by noteAppPoolConnectFailure instead
    expect(mockNoteAppPoolServed).not.toHaveBeenCalled()
  })

  it('42501 "permission denied for table" on the app pool → sweep grants, retry once on the APP pool', async () => {
    const first = recordingClient()
    const second = recordingClient()
    const appConnect = vi.fn().mockResolvedValueOnce(first.client).mockResolvedValueOnce(second.client)
    appPoolHolder.pool = { connect: appConnect }
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })

    const op = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('permission denied for table zz_new_module_table'), { code: '42501' })
      )
      .mockResolvedValueOnce('second try')

    await expect(withUserContext('user1', op)).resolves.toBe('second try')

    expect(mockEnsureAppGrants).toHaveBeenCalledTimes(1)
    expect(mockNoteGrantMissRetry).toHaveBeenCalledTimes(1)
    expect(appConnect).toHaveBeenCalledTimes(2)
    expect(mockPoolConnect).not.toHaveBeenCalled() // never the privileged pool
    expect(first.calls).toContain('ROLLBACK')
    expect(first.release).toHaveBeenCalledTimes(1)
    expect(second.calls).toContain('COMMIT')
    expect(second.calls.some((q) => q.includes("app.enforced = 'on'"))).toBe(true)
  })

  it('retries the grant miss only once', async () => {
    const c1 = recordingClient()
    const c2 = recordingClient()
    appPoolHolder.pool = {
      connect: vi.fn().mockResolvedValueOnce(c1.client).mockResolvedValueOnce(c2.client),
    }
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    const denied = Object.assign(new Error('permission denied for table t'), { code: '42501' })

    await expect(withUserContext('user1', async () => { throw denied })).rejects.toBe(denied)
    expect(mockEnsureAppGrants).toHaveBeenCalledTimes(1)
    expect(mockPoolConnect).not.toHaveBeenCalled()
  })

  it('42501 "new row violates row-level security policy" is rethrown — no sweep, no retry, no privileged pool', async () => {
    const app = recordingClient()
    const appConnect = vi.fn().mockResolvedValue(app.client)
    appPoolHolder.pool = { connect: appConnect }
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    const rls = Object.assign(
      new Error('new row violates row-level security policy for table "tasks"'),
      { code: '42501' }
    )

    await expect(withUserContext('user2', async () => { throw rls })).rejects.toBe(rls)

    expect(mockEnsureAppGrants).not.toHaveBeenCalled()
    expect(mockNoteGrantMissRetry).not.toHaveBeenCalled()
    expect(appConnect).toHaveBeenCalledTimes(1)
    expect(mockPoolConnect).not.toHaveBeenCalled()
    expect(app.calls).toContain('ROLLBACK')
  })

  it('a grant-miss error on the privileged pool is rethrown untouched', async () => {
    const priv = recordingClient()
    mockPoolConnect.mockResolvedValue(priv.client)
    appPoolHolder.pool = null
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    const denied = Object.assign(new Error('permission denied for table t'), { code: '42501' })

    await expect(withUserContext('user1', async () => { throw denied })).rejects.toBe(denied)
    expect(mockEnsureAppGrants).not.toHaveBeenCalled()
    expect(mockPoolConnect).toHaveBeenCalledTimes(1)
  })

  it('stale-connection retry works on the app pool too', async () => {
    const staleRelease = vi.fn()
    const stale = makeRawClient({
      query: async () => { throw new Error('Connection terminated unexpectedly') },
      release: staleRelease,
    })
    const good = recordingClient()
    appPoolHolder.pool = {
      connect: vi.fn().mockResolvedValueOnce(stale).mockResolvedValueOnce(good.client),
    }
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })

    await expect(withUserContext('user1', async () => 'ok')).resolves.toBe('ok')
    expect(staleRelease).toHaveBeenCalledWith(true)
    expect(good.calls.some((q) => q.includes("app.enforced = 'on'"))).toBe(true)
    expect(mockPoolConnect).not.toHaveBeenCalled()
  })

  it('sees a grant miss through Drizzle\'s DrizzleQueryError wrapper (code lives on cause)', async () => {
    const first = recordingClient()
    const second = recordingClient()
    appPoolHolder.pool = {
      connect: vi.fn().mockResolvedValueOnce(first.client).mockResolvedValueOnce(second.client),
    }
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    const pgErr = Object.assign(new Error('permission denied for table zz_late'), { code: '42501' })
    const wrapped = Object.assign(new Error('Failed query: SELECT count(*) FROM zz_late\nparams: '), {
      cause: pgErr,
    })
    const op = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValueOnce('after sweep')

    await expect(withUserContext('user1', op)).resolves.toBe('after sweep')
    expect(mockEnsureAppGrants).toHaveBeenCalledTimes(1)
    expect(mockPoolConnect).not.toHaveBeenCalled()
  })

  it('sees an RLS denial through the wrapper too — still no retry', async () => {
    const app = recordingClient()
    appPoolHolder.pool = { connect: vi.fn().mockResolvedValue(app.client) }
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    const wrapped = Object.assign(new Error('Failed query: UPDATE tasks …'), {
      cause: Object.assign(new Error('new row violates row-level security policy for table "tasks"'), {
        code: '42501',
      }),
    })
    await expect(withUserContext('user2', async () => { throw wrapped })).rejects.toBe(wrapped)
    expect(mockEnsureAppGrants).not.toHaveBeenCalled()
  })

  it('retries a stale connection reported through the wrapper', async () => {
    const staleRelease = vi.fn()
    const stale = makeRawClient({ release: staleRelease })
    const good = recordingClient()
    mockPoolConnect.mockResolvedValueOnce(stale).mockResolvedValueOnce(good.client)
    const { withUserContext } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    const wrapped = Object.assign(new Error('Failed query: SELECT 1'), {
      cause: new Error('Connection terminated unexpectedly'),
    })
    const op = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValueOnce('ok')

    await expect(withUserContext('user1', op)).resolves.toBe('ok')
    expect(staleRelease).toHaveBeenCalledWith(true)
    expect(mockPoolConnect).toHaveBeenCalledTimes(2)
  })

  it('isGrantMissError matches only the permission-denied family of 42501', async () => {
    const { isGrantMissError } = await loadDbIndex({ connect: mockPoolConnect, end: mockPoolEnd })
    expect(isGrantMissError({ code: '42501', message: 'permission denied for table tasks' })).toBe(true)
    expect(isGrantMissError({ code: '42501', message: 'permission denied for relation tasks' })).toBe(true)
    expect(isGrantMissError({ code: '42501', message: 'permission denied for schema app' })).toBe(true)
    expect(isGrantMissError({ code: '42501', message: 'permission denied for function f' })).toBe(true)
    expect(isGrantMissError({ code: '42501', message: 'permission denied for sequence s' })).toBe(true)
    expect(isGrantMissError({ code: '42501', message: 'new row violates row-level security policy for table "tasks"' })).toBe(false)
    expect(isGrantMissError({ code: '42501', message: 'new row violates row-level security policy (USING expression) for table "t"' })).toBe(false)
    expect(isGrantMissError({ code: '42501', message: 'permission denied to create role' })).toBe(false)
    expect(isGrantMissError({ code: '23505', message: 'permission denied for table t' })).toBe(false)
    expect(isGrantMissError({ code: '42501' })).toBe(false)
    expect(isGrantMissError(null)).toBe(false)
    expect(isGrantMissError('permission denied for table t')).toBe(false)
  })
})
