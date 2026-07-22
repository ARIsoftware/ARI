/**
 * Tests for lib/db/pool.ts
 *
 * The pool module uses `pg` Pool, reads DATABASE_URL, and monkey-patches
 * pool.connect() with a SELECT 1 validation step. We mock `pg` to avoid
 * any real DB connections.
 *
 * Because pool.ts is a singleton (the module-level `pool` is created once),
 * we reset module state between tests with vi.resetModules().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── mock state accessible per-test ────────────────────────────────────────────

let capturedPoolOptions: Record<string, unknown> | null = null
let mockPoolInstance: {
  query: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.resetModules()
  capturedPoolOptions = null
  delete (globalThis as any).__ariPgPool
  delete process.env.DATABASE_POOL_MAX

  mockPoolInstance = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn(),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }
})

afterEach(() => {
  delete (globalThis as any).__ariPgPool
  delete process.env.DATABASE_POOL_MAX
  vi.unstubAllEnvs()
})

// ── Helper: load pool module with controlled environment ────────────────────────

async function loadPool(opts: {
  databaseUrl?: string
  nodeEnv?: string
  poolMax?: string
}) {
  const { databaseUrl, nodeEnv, poolMax } = opts

  if (databaseUrl !== undefined) {
    process.env.DATABASE_URL = databaseUrl
  } else {
    delete process.env.DATABASE_URL
  }

  if (nodeEnv) {
    ;(process.env as any).NODE_ENV = nodeEnv
  }

  if (poolMax !== undefined) {
    process.env.DATABASE_POOL_MAX = poolMax
  }

  // The Pool mock must be a class (constructor)
  vi.doMock('pg', () => {
    class Pool {
      query: ReturnType<typeof vi.fn>
      connect: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
      end: ReturnType<typeof vi.fn>

      constructor(opts: Record<string, unknown>) {
        capturedPoolOptions = opts
        this.query = mockPoolInstance.query
        this.connect = mockPoolInstance.connect
        this.on = mockPoolInstance.on
        this.end = mockPoolInstance.end
      }
    }
    return { Pool }
  })

  return await import('@/lib/db/pool')
}

// ── pool creation ──────────────────────────────────────────────────────────────

describe('pool — createPool', () => {
  it('returns null when DATABASE_URL is not set', async () => {
    const { pool } = await loadPool({ databaseUrl: undefined })
    expect(pool).toBeNull()
  })

  it('creates a Pool when DATABASE_URL is set', async () => {
    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    expect(pool).not.toBeNull()
    expect(capturedPoolOptions).not.toBeNull()
    expect(capturedPoolOptions!.connectionString).toBe('postgresql://localhost/test')
  })

  it('uses max=3 in production mode', async () => {
    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test', nodeEnv: 'production' })
    expect(pool).not.toBeNull()
    expect(capturedPoolOptions!.max).toBe(3)
  })

  it('uses max=10 in non-production mode', async () => {
    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test', nodeEnv: 'test' })
    expect(capturedPoolOptions!.max).toBe(10)
  })

  it('respects DATABASE_POOL_MAX env var', async () => {
    const { pool } = await loadPool({
      databaseUrl: 'postgresql://localhost/test',
      poolMax: '5',
    })
    expect(capturedPoolOptions!.max).toBe(5)
  })

  it('disables SSL for localhost connections', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    expect(capturedPoolOptions!.ssl).toBe(false)
  })

  it('disables SSL for 127.0.0.1 connections', async () => {
    await loadPool({ databaseUrl: 'postgresql://127.0.0.1:5432/test' })
    expect(capturedPoolOptions!.ssl).toBe(false)
  })

  it('enables SSL for remote connections', async () => {
    await loadPool({ databaseUrl: 'postgresql://db.example.com/test' })
    expect(capturedPoolOptions!.ssl).toEqual({ rejectUnauthorized: false })
  })

  it('sets keepAlive to true', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    expect(capturedPoolOptions!.keepAlive).toBe(true)
  })

  it('registers an error handler via pool.on', async () => {
    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('idle timeout is 4000ms in production', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test', nodeEnv: 'production' })
    expect(capturedPoolOptions!.idleTimeoutMillis).toBe(4000)
  })

  it('idle timeout is 10000ms in non-production', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test', nodeEnv: 'test' })
    expect(capturedPoolOptions!.idleTimeoutMillis).toBe(10000)
  })

  it('connectionTimeoutMillis is 15000', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    expect(capturedPoolOptions!.connectionTimeoutMillis).toBe(15000)
  })

  it('allowExitOnIdle is true', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    expect(capturedPoolOptions!.allowExitOnIdle).toBe(true)
  })

  it('keepAliveInitialDelayMillis is 10000', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    expect(capturedPoolOptions!.keepAliveInitialDelayMillis).toBe(10000)
  })
})

// ── addConnectionValidation (monkey-patched connect) ──────────────────────────

describe('pool — addConnectionValidation', () => {
  it('validates connection with SELECT 1 on connect()', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    const clientRelease = vi.fn()
    const rawClient = { query: clientQuery, release: clientRelease }
    mockPoolInstance.connect.mockResolvedValue(rawClient)

    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    const client = await pool!.connect()

    expect(clientQuery).toHaveBeenCalledWith('SELECT 1')
    expect(client).toBe(rawClient)
  })

  it('releases dead connection and re-connects when SELECT 1 fails', async () => {
    const deadClientQuery = vi.fn().mockRejectedValue(new Error('Connection terminated'))
    const deadClientRelease = vi.fn()
    const goodClient = { query: vi.fn().mockResolvedValue({}), release: vi.fn() }

    mockPoolInstance.connect
      .mockResolvedValueOnce({ query: deadClientQuery, release: deadClientRelease })
      .mockResolvedValueOnce(goodClient)

    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    const client = await pool!.connect()

    // Dead client released with destroy flag
    expect(deadClientRelease).toHaveBeenCalledWith(true)
    // Two connects: first dead, second fresh
    expect(mockPoolInstance.connect).toHaveBeenCalledTimes(2)
    expect(client).toBe(goodClient)
  })

  it('swallows release(true) failure when reconnecting', async () => {
    const deadClientRelease = vi.fn().mockImplementation(() => {
      throw new Error('already released')
    })
    const deadClientQuery = vi.fn().mockRejectedValue(new Error('Connection terminated'))
    const goodClient = { query: vi.fn().mockResolvedValue({}), release: vi.fn() }

    mockPoolInstance.connect
      .mockResolvedValueOnce({ query: deadClientQuery, release: deadClientRelease })
      .mockResolvedValueOnce(goodClient)

    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    // Should not throw even when release(true) throws
    const client = await pool!.connect()
    expect(client).toBe(goodClient)
  })

  it('passes through callback-style connect unchanged (legacy path)', async () => {
    const cb = vi.fn()
    // Simulate legacy callback: connect(cb) calls originalConnect(cb)
    mockPoolInstance.connect.mockImplementation((callback: Function) => {
      callback(null, {}, vi.fn())
    })

    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test' })
    pool!.connect(cb as any)
    // The underlying connect was called with the callback directly
    expect(mockPoolInstance.connect).toHaveBeenCalledWith(cb)
  })
})

// ── error event handler ────────────────────────────────────────────────────────

describe('pool — error event handler', () => {
  it('error handler does not throw when called', async () => {
    await loadPool({ databaseUrl: 'postgresql://localhost/test' })

    const [, errorHandler] = mockPoolInstance.on.mock.calls.find(
      ([evt]: unknown[]) => evt === 'error'
    ) ?? []
    expect(errorHandler).toBeDefined()
    expect(() => errorHandler(new Error('unexpected pool error'))).not.toThrow()
  })
})

// ── globalThis caching ─────────────────────────────────────────────────────────

describe('pool — globalThis caching in non-production mode', () => {
  it('stores the pool in globalThis in non-production mode', async () => {
    const { pool } = await loadPool({ databaseUrl: 'postgresql://localhost/test', nodeEnv: 'development' })
    expect((globalThis as any).__ariPgPool).toBe(pool)
    ;(process.env as any).NODE_ENV = 'test'
  })

  it('uses existing globalThis.__ariPgPool when available (skips Pool constructor)', async () => {
    const fakePool = { _fake: true, connect: vi.fn(), on: vi.fn(), end: vi.fn() }
    ;(globalThis as any).__ariPgPool = fakePool

    vi.doMock('pg', () => {
      const PoolSpy = vi.fn()
      return { Pool: PoolSpy }
    })

    process.env.DATABASE_URL = 'postgresql://localhost/test'
    const { pool } = await import('@/lib/db/pool')

    // Should have reused the existing pool from globalThis
    expect(pool).toBe(fakePool)
    delete (globalThis as any).__ariPgPool
  })
})
