/**
 * Tests for lib/db/app-role.ts — provisioning / reconciliation of the
 * non-BYPASSRLS `ari_app` role on the privileged pool.
 *
 * The privileged pool and pg's Client are replaced with scripted fakes that
 * record every statement, so each branch of the reconcile state machine is
 * exercised without a database. Encryption is real (BETTER_AUTH_SECRET is
 * stubbed) so the stored secret round-trips through lib/crypto exactly as in
 * production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── privileged pool (swappable, incl. null) ────────────────────────────────
const poolHolder = vi.hoisted(() => ({ pool: null as any }))
vi.mock('@/lib/db/pool', () => ({
  get pool() {
    return poolHolder.pool
  },
  sslConfigFor: () => false,
}))

// ── pg.Client — the one-off probe connection ──────────────────────────────
type ProbeStep = 'ok' | { code?: string; message: string }
const pgHolder = vi.hoisted(() => ({
  configs: [] as Record<string, unknown>[],
  connectQueue: [] as ProbeStep[],
  queryFails: null as null | string,
  endFails: false,
  ended: 0,
}))
vi.mock('pg', () => ({
  Client: class FakeClient {
    constructor(cfg: Record<string, unknown>) {
      pgHolder.configs.push(cfg)
    }
    async connect() {
      const step = pgHolder.connectQueue.length > 0 ? pgHolder.connectQueue.shift()! : 'ok'
      if (step !== 'ok') {
        const err = new Error(step.message) as Error & { code?: string }
        if (step.code) err.code = step.code
        throw err
      }
    }
    async query() {
      if (pgHolder.queryFails) throw new Error(pgHolder.queryFails)
      return { rows: [{ '?column?': 1 }] }
    }
    async end() {
      pgHolder.ended++
      if (pgHolder.endFails) throw new Error('end failed')
    }
  },
}))

import { encrypt, decrypt } from '@/lib/crypto'
import {
  APP_GRANT_STATEMENTS,
  APP_ROLE_LOCK_KEY,
  FORCE_MIN_INTERVAL_MS,
  _resetAppRoleStateForTests,
  ensureAppGrants,
  ensureAppRole,
  getAppRolePassword,
  getAppRoleStatus,
  isAppRoleDisabled,
} from '@/lib/db/app-role'

// ── scripted privileged pool ───────────────────────────────────────────────

type PgErr = { code?: string; message: string }
interface Script {
  /** row returned by the secret SELECT; null → no rows */
  secretRow?: { secret: string | null; rotated_at: Date | string | null } | null
  readSecretError?: PgErr
  roleExists?: boolean
  roleError?: PgErr
  updateRowCount?: number
  grantError?: PgErr
  connectError?: PgErr
}

function mkErr(e: PgErr): Error & { code?: string } {
  const err = new Error(e.message) as Error & { code?: string }
  if (e.code) err.code = e.code
  return err
}

function makePool(script: Script = {}) {
  const sql: string[] = []
  const params: unknown[] = []
  const responder = async (text: string, values?: unknown[]) => {
    sql.push(text)
    params.push(values)
    if (text.startsWith('SELECT "app_role_secret"')) {
      if (script.readSecretError) throw mkErr(script.readSecretError)
      return {
        rows: script.secretRow ? [script.secretRow] : [],
        rowCount: script.secretRow ? 1 : 0,
      }
    }
    if (text.includes('pg_roles')) return { rows: [], rowCount: script.roleExists ? 1 : 0 }
    if (/^(CREATE|ALTER) ROLE/.test(text)) {
      if (script.roleError) throw mkErr(script.roleError)
      return { rows: [], rowCount: 0 }
    }
    if (text.startsWith('UPDATE "ari_instance"'))
      return { rows: [], rowCount: script.updateRowCount ?? 1 }
    if (text.startsWith('INSERT INTO "ari_instance"')) return { rows: [], rowCount: 1 }
    if (/^(GRANT|ALTER DEFAULT|DO \$\$)/.test(text)) {
      if (script.grantError) throw mkErr(script.grantError)
      return { rows: [], rowCount: 0 }
    }
    return { rows: [], rowCount: 0 } // BEGIN / COMMIT / ROLLBACK / advisory lock
  }
  const client = { query: vi.fn(responder), release: vi.fn() }
  const pool = {
    query: vi.fn(responder),
    connect: vi.fn(async () => {
      if (script.connectError) throw mkErr(script.connectError)
      return client
    }),
  }
  return { pool, client, sql, params }
}

const rolePassword = (sql: string[]): string | null => {
  const stmt = sql.find((s) => /^(CREATE|ALTER) ROLE/.test(s))
  return stmt ? /PASSWORD '([^']+)'/.exec(stmt)![1] : null
}
const storedSecret = (params: unknown[]): string =>
  (
    params.find(
      (p) => Array.isArray(p) && typeof p[0] === 'string' && (p[0] as string).startsWith('enc:'),
    ) as string[]
  )[0]

/** A secret encrypted under a DIFFERENT BETTER_AUTH_SECRET (undecryptable here). */
function foreignSecret(): string {
  const mine = process.env.BETTER_AUTH_SECRET
  vi.stubEnv('BETTER_AUTH_SECRET', 'someone-elses-secret')
  const value = encrypt('foreign-password')
  vi.stubEnv('BETTER_AUTH_SECRET', mine!)
  return value
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000)

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  _resetAppRoleStateForTests()
  poolHolder.pool = null
  pgHolder.configs = []
  pgHolder.connectQueue = []
  pgHolder.queryFails = null
  pgHolder.endFails = false
  pgHolder.ended = 0
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret')
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:pw@localhost:5432/ari')
  vi.stubEnv('ARI_DISABLE_RLS_ENFORCEMENT', '')
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  logSpy.mockRestore()
  warnSpy.mockRestore()
})

// ── gates ──────────────────────────────────────────────────────────────────

describe('ensureAppRole — gates', () => {
  it('starts pending with no password', () => {
    expect(getAppRoleStatus()).toMatchObject({
      state: 'pending',
      roleName: 'ari_app',
      rotatedAt: null,
      checkedAt: null,
    })
    expect(getAppRolePassword()).toBeNull()
  })

  it.each(['1', 'true', 'TRUE', ' yes ', 'on'])(
    'kill switch %j → disabled, nothing touched',
    async (v) => {
      vi.stubEnv('ARI_DISABLE_RLS_ENFORCEMENT', v)
      const { pool } = makePool()
      poolHolder.pool = pool
      expect(isAppRoleDisabled()).toBe(true)
      const status = await ensureAppRole()
      expect(status.state).toBe('disabled')
      expect(pool.query).not.toHaveBeenCalled()
      expect(pool.connect).not.toHaveBeenCalled()
      expect(getAppRolePassword()).toBeNull()
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[app-role] disabled'))
    },
  )

  it.each(['', '0', 'false', 'off'])('kill switch %j is not set', (v) => {
    vi.stubEnv('ARI_DISABLE_RLS_ENFORCEMENT', v)
    expect(isAppRoleDisabled()).toBe(false)
  })

  it('no pool → unavailable', async () => {
    const status = await ensureAppRole()
    expect(status).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('pool') })
  })

  it('no BETTER_AUTH_SECRET → unavailable (pre-setup boot must not crash)', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    const { pool } = makePool()
    poolHolder.pool = pool
    const status = await ensureAppRole()
    expect(status).toMatchObject({
      state: 'unavailable',
      reason: expect.stringContaining('BETTER_AUTH_SECRET'),
    })
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('getAppRoleStatus returns a copy', async () => {
    const s = getAppRoleStatus()
    s.state = 'ready'
    expect(getAppRoleStatus().state).toBe('pending')
  })
})

// ── fast path ──────────────────────────────────────────────────────────────

describe('ensureAppRole — fast path', () => {
  it('stored secret decrypts → ready with one SELECT, no lock, no probe', async () => {
    const rotated = new Date('2026-09-13T10:00:00.000Z')
    const { pool, sql } = makePool({
      secretRow: { secret: encrypt('pw-live'), rotated_at: rotated },
    })
    poolHolder.pool = pool
    const status = await ensureAppRole()
    expect(status).toMatchObject({ state: 'ready', rotatedAt: rotated.toISOString() })
    expect(status.checkedAt).toEqual(expect.any(Number))
    expect(getAppRolePassword()).toBe('pw-live')
    expect(sql).toEqual([expect.stringContaining('SELECT "app_role_secret"')])
    expect(pool.connect).not.toHaveBeenCalled()
    expect(pgHolder.configs).toHaveLength(0)
    expect(logSpy).toHaveBeenCalledWith('[app-role] ready')
  })

  it('accepts a string rotated_at and nulls an unparseable one', async () => {
    const a = makePool({
      secretRow: { secret: encrypt('pw'), rotated_at: '2026-01-02T03:04:05.000Z' },
    })
    poolHolder.pool = a.pool
    expect((await ensureAppRole()).rotatedAt).toBe('2026-01-02T03:04:05.000Z')
    _resetAppRoleStateForTests()
    const b = makePool({ secretRow: { secret: encrypt('pw'), rotated_at: 'not a date' } })
    poolHolder.pool = b.pool
    expect((await ensureAppRole()).rotatedAt).toBeNull()
  })

  it.each(['42703', '42P01'])('missing column/table (%s) → unavailable', async (code) => {
    const { pool } = makePool({ readSecretError: { code, message: 'column does not exist' } })
    poolHolder.pool = pool
    const status = await ensureAppRole()
    expect(status).toMatchObject({
      state: 'unavailable',
      reason: expect.stringContaining('setup.sql'),
    })
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('other read errors → degraded', async () => {
    const { pool } = makePool({
      readSecretError: { code: '57P01', message: 'terminating connection' },
    })
    poolHolder.pool = pool
    expect(await ensureAppRole()).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('terminating connection'),
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[app-role] degraded'))
  })

  it('concurrent callers share one in-flight reconcile', async () => {
    const { pool } = makePool({ secretRow: { secret: encrypt('pw'), rotated_at: null } })
    poolHolder.pool = pool
    const [a, b] = await Promise.all([ensureAppRole(), ensureAppRole()])
    expect(a.state).toBe('ready')
    expect(b.state).toBe('ready')
    expect(pool.query).toHaveBeenCalledTimes(1)
  })

  it('does not log again when the status is unchanged', async () => {
    const { pool } = makePool({ secretRow: { secret: encrypt('pw'), rotated_at: null } })
    poolHolder.pool = pool
    await ensureAppRole()
    await ensureAppRole()
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})

// ── full reconcile: provisioning ───────────────────────────────────────────

describe('ensureAppRole — provisioning', () => {
  it('no secret → CREATE ROLE, store encrypted secret, grants, COMMIT, probe → ready', async () => {
    const { pool, client, sql, params } = makePool({ secretRow: null, roleExists: false })
    poolHolder.pool = pool

    const status = await ensureAppRole()

    expect(status.state).toBe('ready')
    expect(status.rotatedAt).toEqual(expect.any(String))
    // transaction shape
    expect(sql[0]).toContain('SELECT "app_role_secret"') // fast-path read on the pool
    expect(sql.slice(1, 4)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1::bigint)',
      expect.stringContaining('SELECT "app_role_secret"'), // double-check under the lock
    ])
    expect(params[2]).toEqual([APP_ROLE_LOCK_KEY])
    expect(APP_ROLE_LOCK_KEY).not.toBe(9173451) // bootstrap's session lock key
    expect(sql).toContainEqual('SELECT 1 FROM pg_roles WHERE rolname = $1')
    const create = sql.find((s) => s.startsWith('CREATE ROLE'))!
    expect(create).toMatch(
      /^CREATE ROLE ari_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD '[A-Za-z0-9_-]{32}'$/,
    )
    expect(sql.some((s) => s.startsWith('ALTER ROLE'))).toBe(false)
    // secret stored encrypted and round-trips to the very password given to Postgres
    const pw = rolePassword(sql)!
    expect(decrypt(storedSecret(params))).toBe(pw)
    expect(sql).toContainEqual(
      'UPDATE "ari_instance" SET "app_role_secret" = $1, "app_role_secret_rotated_at" = NOW()',
    )
    expect(sql.some((s) => s.startsWith('INSERT INTO "ari_instance"'))).toBe(false)
    // exact grant sweep, then COMMIT, inside the same transaction
    const grantStart = sql.indexOf(APP_GRANT_STATEMENTS[0])
    expect(sql.slice(grantStart, grantStart + APP_GRANT_STATEMENTS.length)).toEqual([
      ...APP_GRANT_STATEMENTS,
    ])
    expect(sql[grantStart + APP_GRANT_STATEMENTS.length]).toBe('COMMIT')
    expect(sql).not.toContain('ROLLBACK')
    // probe ran AFTER commit as the app role with the new password
    expect(pgHolder.configs).toHaveLength(1)
    expect(pgHolder.configs[0]).toMatchObject({
      user: 'ari_app',
      password: pw,
      host: 'localhost',
      port: 5432,
      database: 'ari',
    })
    expect(pgHolder.ended).toBe(1)
    expect(getAppRolePassword()).toBe(pw)
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('the grant sweep never transfers ownership', () => {
    for (const s of APP_GRANT_STATEMENTS) expect(s).not.toMatch(/OWNER TO/i)
    expect(APP_GRANT_STATEMENTS).toContain('GRANT USAGE ON SCHEMA app TO ari_app')
    expect(APP_GRANT_STATEMENTS).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ari_app',
    )
    expect(APP_GRANT_STATEMENTS.at(-1)).toContain(
      'REVOKE ALL ON FUNCTION public.get_table_row_counts() FROM ari_app',
    )
  })

  it('a row with a NULL secret provisions the same way', async () => {
    const { pool, sql } = makePool({
      secretRow: { secret: null, rotated_at: null },
      roleExists: false,
    })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
    expect(sql.some((s) => s.startsWith('CREATE ROLE'))).toBe(true)
  })

  it('existing role → ALTER ROLE (attributes + password repaired)', async () => {
    const { pool, sql } = makePool({ secretRow: null, roleExists: true })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
    expect(sql.find((s) => s.startsWith('ALTER ROLE'))).toMatch(
      /^ALTER ROLE ari_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD '/,
    )
    expect(sql.some((s) => s.startsWith('CREATE ROLE'))).toBe(false)
  })

  it('missing ari_instance row → INSERT the secret instead', async () => {
    const { pool, sql, params } = makePool({ secretRow: null, updateRowCount: 0 })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
    const insertAt = sql.findIndex((s) => s.startsWith('INSERT INTO "ari_instance"'))
    expect(insertAt).toBeGreaterThan(0)
    expect((params[insertAt] as string[])[0]).toMatch(/^enc:/)
  })

  it('42501 on CREATE ROLE → unsupported, ROLLBACK, nothing stored', async () => {
    const { pool, sql } = makePool({
      secretRow: null,
      roleError: { code: '42501', message: 'permission denied to create role' },
    })
    poolHolder.pool = pool
    const status = await ensureAppRole()
    expect(status).toMatchObject({
      state: 'unsupported',
      reason: expect.stringContaining('CREATEROLE'),
    })
    expect(sql).toContain('ROLLBACK')
    expect(sql.some((s) => s.startsWith('UPDATE "ari_instance"'))).toBe(false)
    expect(getAppRolePassword()).toBeNull()
    expect(pgHolder.configs).toHaveLength(0)
  })

  it('42710 (role appeared concurrently) → degraded, ROLLBACK', async () => {
    const { pool, sql } = makePool({
      secretRow: null,
      roleError: { code: '42710', message: 'role already exists' },
    })
    poolHolder.pool = pool
    expect(await ensureAppRole()).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('concurrently'),
    })
    expect(sql).toContain('ROLLBACK')
  })

  it('any other CREATE ROLE error → degraded, ROLLBACK', async () => {
    const { pool, sql } = makePool({
      secretRow: null,
      roleError: { code: '53300', message: 'too many connections' },
    })
    poolHolder.pool = pool
    expect(await ensureAppRole()).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('too many connections'),
    })
    expect(sql.filter((s) => s === 'ROLLBACK')).toHaveLength(1)
  })

  it('a failing grant rolls the whole provisioning back', async () => {
    const { pool, sql } = makePool({
      secretRow: null,
      grantError: { code: '3F000', message: 'schema "app" does not exist' },
    })
    poolHolder.pool = pool
    expect(await ensureAppRole()).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('schema "app" does not exist'),
    })
    expect(sql).toContain('ROLLBACK')
    expect(sql).not.toContain('COMMIT')
    expect(getAppRolePassword()).toBeNull()
  })

  it('a failing ROLLBACK is swallowed', async () => {
    const { pool, client } = makePool({
      secretRow: null,
      roleError: { code: '53300', message: 'boom' },
    })
    const responder = client.query.getMockImplementation()!
    client.query.mockImplementation(async (text: string, values?: unknown[]) => {
      if (text === 'ROLLBACK') throw new Error('connection is closed')
      return responder(text, values)
    })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('degraded')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('probe fails after COMMIT → degraded, but the password is kept (retryable)', async () => {
    pgHolder.connectQueue = [{ code: '28P01', message: 'password authentication failed' }]
    const { pool, sql } = makePool({ secretRow: null })
    poolHolder.pool = pool
    const status = await ensureAppRole()
    expect(status).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('provisioned, but connecting as ari_app failed'),
    })
    expect(sql).toContain('COMMIT')
    expect(getAppRolePassword()).toBe(rolePassword(sql))
    expect(pgHolder.ended).toBe(0) // never connected → end() not called
  })

  it('probe SELECT 1 failing → degraded, end() still called', async () => {
    pgHolder.queryFails = 'server closed the connection unexpectedly'
    const { pool } = makePool({ secretRow: null })
    poolHolder.pool = pool
    expect(await ensureAppRole()).toMatchObject({ state: 'degraded' })
    expect(pgHolder.ended).toBe(1)
  })

  it('a failing end() on the probe is swallowed', async () => {
    pgHolder.endFails = true
    const { pool } = makePool({ secretRow: null })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
  })

  it('DATABASE_URL missing at probe time → degraded', async () => {
    const { pool } = makePool({ secretRow: null })
    poolHolder.pool = pool
    vi.stubEnv('DATABASE_URL', '')
    expect(await ensureAppRole()).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('DATABASE_URL'),
    })
  })

  it('pool.connect failing → degraded', async () => {
    const { pool } = makePool({
      secretRow: null,
      connectError: { message: 'timeout exceeded when trying to connect' },
    })
    poolHolder.pool = pool
    expect(await ensureAppRole()).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('could not acquire'),
    })
  })

  it('another process finished first: secret decrypts under the lock → ready without rotating', async () => {
    // pool-level read sees no secret; the read under the lock sees one
    const { pool, client, sql } = makePool({ secretRow: null })
    const responder = client.query.getMockImplementation()!
    client.query.mockImplementation(async (text: string, values?: unknown[]) => {
      if (text.startsWith('SELECT "app_role_secret"'))
        return { rows: [{ secret: encrypt('theirs'), rotated_at: null }], rowCount: 1 }
      return responder(text, values)
    })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
    expect(getAppRolePassword()).toBe('theirs')
    expect(sql.some((s) => /^(CREATE|ALTER) ROLE/.test(s))).toBe(false)
    expect(sql).toContain('COMMIT')
  })
})

// ── rotation guard ─────────────────────────────────────────────────────────

describe('ensureAppRole — undecryptable secret', () => {
  it('rotated < 15 min ago by another deployment → degraded(secret-mismatch), no rotation', async () => {
    const { pool, sql } = makePool({
      secretRow: { secret: foreignSecret(), rotated_at: minutesAgo(3) },
      roleExists: true,
    })
    poolHolder.pool = pool
    const status = await ensureAppRole()
    expect(status).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('secret-mismatch'),
    })
    expect(status.reason).toContain('share the secret')
    expect(sql.some((s) => /^(CREATE|ALTER) ROLE/.test(s))).toBe(false)
    expect(sql).toContain('COMMIT')
    expect(sql).not.toContain('ROLLBACK')
    expect(getAppRolePassword()).toBeNull()
  })

  it('stale rotation stamp → rotate (restored foreign backup / rotated BETTER_AUTH_SECRET)', async () => {
    const { pool, sql } = makePool({
      secretRow: { secret: foreignSecret(), rotated_at: minutesAgo(20) },
      roleExists: true,
    })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
    expect(sql.some((s) => s.startsWith('ALTER ROLE'))).toBe(true)
  })

  it('no rotation stamp → rotate', async () => {
    const { pool, sql } = makePool({
      secretRow: { secret: foreignSecret(), rotated_at: null },
      roleExists: false,
    })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
    expect(sql.some((s) => s.startsWith('CREATE ROLE'))).toBe(true)
  })

  it('a plaintext (non-enc:) value is never used as the password — it is rotated', async () => {
    const { pool, sql } = makePool({
      secretRow: { secret: 'plain-text-password', rotated_at: null },
      roleExists: true,
    })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('ready')
    expect(rolePassword(sql)).not.toBe('plain-text-password')
    expect(getAppRolePassword()).not.toBe('plain-text-password')
  })
})

// ── force ──────────────────────────────────────────────────────────────────

describe('ensureAppRole — force', () => {
  it('secret decrypts and the probe succeeds → ready, no rotation', async () => {
    const { pool, sql } = makePool({
      secretRow: { secret: encrypt('pw-live'), rotated_at: minutesAgo(1) },
      roleExists: true,
    })
    poolHolder.pool = pool
    const status = await ensureAppRole({ force: true })
    expect(status.state).toBe('ready')
    expect(getAppRolePassword()).toBe('pw-live')
    expect(sql).toContain('SELECT pg_advisory_xact_lock($1::bigint)')
    expect(sql.some((s) => /^(CREATE|ALTER) ROLE/.test(s))).toBe(false)
    expect(sql).toContain('COMMIT')
    expect(pgHolder.configs).toHaveLength(1)
    expect(pgHolder.configs[0]).toMatchObject({ password: 'pw-live' })
    expect(pgHolder.ended).toBe(1)
  })

  it('probe 28P01 (password changed out-of-band) → ALTER ROLE with a fresh password', async () => {
    pgHolder.connectQueue = [{ code: '28P01', message: 'password authentication failed' }, 'ok']
    const { pool, sql } = makePool({
      secretRow: { secret: encrypt('stale'), rotated_at: minutesAgo(1) },
      roleExists: true,
    })
    poolHolder.pool = pool
    expect((await ensureAppRole({ force: true })).state).toBe('ready')
    expect(sql.some((s) => s.startsWith('ALTER ROLE'))).toBe(true)
    const pw = rolePassword(sql)!
    expect(pw).not.toBe('stale')
    expect(getAppRolePassword()).toBe(pw)
    expect(pgHolder.configs).toHaveLength(2)
    expect(pgHolder.configs[1]).toMatchObject({ password: pw })
  })

  it('probe 28000 (role dropped) → CREATE ROLE', async () => {
    pgHolder.connectQueue = [{ code: '28000', message: 'role "ari_app" does not exist' }, 'ok']
    const { pool, sql } = makePool({
      secretRow: { secret: encrypt('gone'), rotated_at: minutesAgo(1) },
      roleExists: false,
    })
    poolHolder.pool = pool
    expect((await ensureAppRole({ force: true })).state).toBe('ready')
    expect(sql.some((s) => s.startsWith('CREATE ROLE'))).toBe(true)
  })

  it('probe fails for a non-credential reason → degraded, no rotation', async () => {
    pgHolder.connectQueue = [{ message: 'connect ECONNREFUSED 127.0.0.1:5432' }]
    const { pool, sql } = makePool({
      secretRow: { secret: encrypt('pw'), rotated_at: minutesAgo(1) },
      roleExists: true,
    })
    poolHolder.pool = pool
    expect(await ensureAppRole({ force: true })).toMatchObject({
      state: 'degraded',
      reason: expect.stringContaining('ECONNREFUSED'),
    })
    expect(sql.some((s) => /^(CREATE|ALTER) ROLE/.test(s))).toBe(false)
    expect(sql).toContain('COMMIT')
    expect(pgHolder.ended).toBe(0)
  })

  it('forced reconciles are rate-limited to one per minute per process', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T12:00:00Z'))
    const { pool } = makePool({
      secretRow: { secret: encrypt('pw'), rotated_at: null },
      roleExists: true,
    })
    poolHolder.pool = pool
    expect((await ensureAppRole({ force: true })).state).toBe('ready')
    const calls = pool.query.mock.calls.length + pool.connect.mock.calls.length
    // within the window: nothing happens, current status is returned
    vi.setSystemTime(new Date('2026-09-13T12:00:30Z'))
    expect((await ensureAppRole({ force: true })).state).toBe('ready')
    expect(pool.query.mock.calls.length + pool.connect.mock.calls.length).toBe(calls)
    // after the window: allowed again
    vi.setSystemTime(new Date(Date.now() + FORCE_MIN_INTERVAL_MS))
    await ensureAppRole({ force: true })
    expect(pool.query.mock.calls.length + pool.connect.mock.calls.length).toBeGreaterThan(calls)
  })

  it('a non-forced call is not rate-limited by a recent force', async () => {
    const { pool } = makePool({
      secretRow: { secret: encrypt('pw'), rotated_at: null },
      roleExists: true,
    })
    poolHolder.pool = pool
    await ensureAppRole({ force: true })
    const before = pool.query.mock.calls.length
    await ensureAppRole()
    expect(pool.query.mock.calls.length).toBeGreaterThan(before)
  })
})

// ── grants sweep ───────────────────────────────────────────────────────────

describe('ensureAppGrants', () => {
  it('is a no-op until the role has been provisioned in this process', async () => {
    const { pool } = makePool()
    poolHolder.pool = pool
    expect(await ensureAppGrants()).toBe(false)
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('is a no-op with the kill switch or without a pool', async () => {
    vi.stubEnv('ARI_DISABLE_RLS_ENFORCEMENT', '1')
    expect(await ensureAppGrants()).toBe(false)
    vi.stubEnv('ARI_DISABLE_RLS_ENFORCEMENT', '')
    poolHolder.pool = null
    expect(await ensureAppGrants()).toBe(false)
  })

  it('re-applies the exact grant list in one transaction once ready', async () => {
    const { pool, client, sql } = makePool({
      secretRow: { secret: encrypt('pw'), rotated_at: null },
    })
    poolHolder.pool = pool
    await ensureAppRole()
    sql.length = 0
    expect(await ensureAppGrants()).toBe(true)
    expect(sql).toEqual(['BEGIN', ...APP_GRANT_STATEMENTS, 'COMMIT'])
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('also runs while degraded (the role exists, grants may be missing)', async () => {
    pgHolder.connectQueue = [{ code: '28P01', message: 'nope' }]
    const { pool, sql } = makePool({ secretRow: null })
    poolHolder.pool = pool
    expect((await ensureAppRole()).state).toBe('degraded')
    sql.length = 0
    expect(await ensureAppGrants()).toBe(true)
    expect(sql[0]).toBe('BEGIN')
  })

  it('rolls back and returns false on a failing statement', async () => {
    const { pool, client, sql } = makePool({
      secretRow: { secret: encrypt('pw'), rotated_at: null },
    })
    poolHolder.pool = pool
    await ensureAppRole()
    const responder = client.query.getMockImplementation()!
    client.query.mockImplementation(async (text: string, values?: unknown[]) => {
      if (text.startsWith('GRANT USAGE ON SCHEMA app'))
        throw new Error('schema "app" does not exist')
      return responder(text, values)
    })
    sql.length = 0
    expect(await ensureAppGrants()).toBe(false)
    expect(sql).toContain('ROLLBACK')
    expect(sql).not.toContain('COMMIT')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('grant sweep failed'))
  })

  it('returns false when no connection can be acquired', async () => {
    const { pool } = makePool({ secretRow: { secret: encrypt('pw'), rotated_at: null } })
    poolHolder.pool = pool
    await ensureAppRole()
    pool.connect.mockRejectedValueOnce(new Error('pool exhausted'))
    expect(await ensureAppGrants()).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('grant sweep skipped'))
  })

  it('concurrent sweeps share one in-flight run', async () => {
    const { pool } = makePool({ secretRow: { secret: encrypt('pw'), rotated_at: null } })
    poolHolder.pool = pool
    await ensureAppRole()
    pool.connect.mockClear()
    const [a, b] = await Promise.all([ensureAppGrants(), ensureAppGrants()])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(pool.connect).toHaveBeenCalledTimes(1)
  })
})
