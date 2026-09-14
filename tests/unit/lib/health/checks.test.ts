/**
 * Full coverage for lib/health/checks.ts — the extracted health-check logic
 * shared by the individual /api/health/* routes and the aggregate scan.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── pool mock (swappable per test, incl. null) ─────────────────────────────
const poolHolder = vi.hoisted(() => ({
  pool: null as any,
}))
vi.mock('@/lib/db/pool', () => ({
  get pool() {
    return poolHolder.pool
  },
}))

// ── db mock: withUserContext runs its callback against a fake query chain ──
const dbHolder = vi.hoisted(() => ({
  userContextResults: [] as unknown[],
}))
vi.mock('@/lib/db', () => ({
  withUserContext: vi.fn(async (_userId: string, op: (db: any) => Promise<unknown>) =>
    op(queryableImpl(dbHolder.userContextResults.shift()))
  ),
}))

// ── app pool / app role mocks (DB-level RLS enforcement state) ─────────────
const appPoolHolder = vi.hoisted(() => ({
  state: {} as any,
  pool: null as any,
  getAppPool: vi.fn(async () => null as any),
}))
vi.mock('@/lib/db/app-pool', () => ({
  getAppPoolState: () => ({ ...appPoolHolder.state }),
  getAppPool: () => appPoolHolder.getAppPool(),
  getAppPoolIfHealthy: async () => appPoolHolder.pool,
}))
const appRoleHolder = vi.hoisted(() => ({ status: {} as any }))
vi.mock('@/lib/db/app-role', () => ({
  getAppRoleStatus: () => ({ ...appRoleHolder.status }),
}))
vi.mock('@/lib/db/app-connection', () => ({ APP_ROLE_NAME: 'ari_app' }))

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: {
    id: 'id',
    userId: 'user_id',
    moduleId: 'module_id',
    enabled: 'enabled',
    settings: 'settings',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}))

const registryHolder = vi.hoisted(() => ({ modules: [] as any[] }))
vi.mock('@/lib/modules/module-registry', () => ({
  getModules: vi.fn(async () => registryHolder.modules),
}))

const providersHolder = vi.hoisted(() => ({ providers: [] as any[] }))
vi.mock('@/lib/ai-providers', () => ({
  get AI_PROVIDERS() {
    return providersHolder.providers
  },
}))

vi.mock('@/lib/constants', () => ({ INTEGRATIONS_MODULE_ID: 'integrations' }))

const schemasHolder = vi.hoisted(() => ({ schemas: {} as Record<string, string> }))
vi.mock('@/lib/generated/module-schemas', () => ({
  get MODULE_SCHEMAS() {
    return schemasHolder.schemas
  },
}))

const storageHolder = vi.hoisted(() => ({
  config: { provider: 'filesystem' } as any,
  basePath: '/tmp/ari-storage',
  ephemeral: false,
}))
vi.mock('@/lib/storage', () => ({
  readStorageConfig: () => storageHolder.config,
  getDefaultLocalStorageBasePath: () => storageHolder.basePath,
  isStorageUnavailable: () => storageHolder.ephemeral,
}))

const fsHolder = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}))
vi.mock('fs/promises', () => ({
  mkdir: (...a: unknown[]) => fsHolder.mkdir(...a),
  writeFile: (...a: unknown[]) => fsHolder.writeFile(...a),
  unlink: (...a: unknown[]) => fsHolder.unlink(...a),
}))

/**
 * A thenable that satisfies every Drizzle builder call the checks make and
 * resolves to `result`, so the query callbacks actually execute.
 */
function queryableImpl(result: unknown): any {
  const target: any = {
    select: () => target,
    from: () => target,
    where: () => target,
    limit: () => target,
    delete: () => target,
    insert: () => target,
    values: () => target,
    returning: () => target,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  }
  return target
}

import {
  buildTableModuleMap,
  checkAiProviders,
  checkAppRole,
  checkAuthConfig,
  checkDatabase,
  checkModuleStatus,
  checkMultiUser,
  checkRlsTables,
  checkStorageFilesystem,
  connectionBypassesRls,
  rlsEnforcementNote,
  runRlsTest,
  type AppRolePayload,
  type WithRLS,
} from '@/lib/health/checks'

/** Build a withRLS stub that serves `results` in order. */
function makeWithRLS(results: unknown[]) {
  const queue = [...results]
  const fn = vi.fn(async (op: (db: any) => Promise<any>) => op(queryableImpl(queue.shift())))
  return fn as typeof fn & WithRLS
}

/** Enforcement is live: app pool active, app role ready, app role cannot bypass. */
function appPoolActive() {
  appPoolHolder.state = {
    mode: 'app',
    degradedUntil: null,
    degradedReason: null,
    fallbackCount: 0,
    grantMissRetries: 0,
    lastTransition: null,
  }
  appPoolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [{ bypass: false }] }) }
  appPoolHolder.getAppPool.mockReset().mockImplementation(async () => appPoolHolder.pool)
  appRoleHolder.status = {
    state: 'ready',
    roleName: 'ari_app',
    rotatedAt: '2026-09-13T00:00:00.000Z',
    checkedAt: 1,
  }
}

beforeEach(() => {
  poolHolder.pool = null
  dbHolder.userContextResults = []
  appPoolActive()
  schemasHolder.schemas = {}
  registryHolder.modules = []
  providersHolder.providers = []
  storageHolder.config = { provider: 'filesystem' }
  storageHolder.basePath = '/tmp/ari-storage'
  storageHolder.ephemeral = false
  fsHolder.mkdir.mockReset().mockResolvedValue(undefined)
  fsHolder.writeFile.mockReset().mockResolvedValue(undefined)
  fsHolder.unlink.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ── checkDatabase ──────────────────────────────────────────────────────────

describe('checkDatabase', () => {
  it('reports an error when no pool is configured', async () => {
    poolHolder.pool = null
    const result = await checkDatabase()
    expect(result.status).toBe('error')
    expect(result.checks.database.message).toBe('DATABASE_URL not configured')
  })

  it('returns ok and releases the client on a successful SELECT 1', async () => {
    const release = vi.fn()
    const query = vi.fn().mockResolvedValue({ rows: [] })
    poolHolder.pool = { connect: vi.fn().mockResolvedValue({ query, release }) }

    const result = await checkDatabase()

    expect(result.status).toBe('ok')
    expect(result.checks.database).toEqual({ status: 'ok' })
    expect(query).toHaveBeenCalledWith('SELECT 1')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases the client and reports the error when the query throws', async () => {
    const release = vi.fn()
    poolHolder.pool = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockRejectedValue(new Error('connection reset')),
        release,
      }),
    }

    const result = await checkDatabase()

    expect(result.status).toBe('error')
    expect(result.checks.database.message).toBe('connection reset')
    expect(release).toHaveBeenCalledTimes(1)
  })
})

// ── checkAuthConfig ────────────────────────────────────────────────────────

describe('checkAuthConfig', () => {
  it('flags a missing secret and database url in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')

    const result = checkAuthConfig()

    expect(result.isProduction).toBe(false)
    expect(result.secretConfigured).toBe(false)
    expect(result.databaseConfigured).toBe(false)
    expect(result.sslEnabled).toBe(false)
    expect(result.hasProductionOrigin).toBe(false)
    // dev adds the two localhost origins, and no app url is set
    expect(result.trustedOriginsCount).toBe(2)
    expect(result.environment.BETTER_AUTH_SECRET).toBe('Missing or too short')
    expect(result.environment.DATABASE_URL).toBe('Not set')
    expect(result.environment.NEXT_PUBLIC_APP_URL).toBe('Not set')
  })

  it('rejects a secret shorter than 32 characters', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'a'.repeat(31))
    expect(checkAuthConfig().secretConfigured).toBe(false)
  })

  it('accepts a 32-character secret', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'a'.repeat(32))
    expect(checkAuthConfig().secretConfigured).toBe(true)
    expect(checkAuthConfig().environment.BETTER_AUTH_SECRET).toBe('Set (32+ chars)')
  })

  it('treats a localhost app url as a non-production origin', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    const result = checkAuthConfig()
    expect(result.hasProductionOrigin).toBe(false)
    // app url + two localhost defaults
    expect(result.trustedOriginsCount).toBe(3)
  })

  it('reports a production origin and ssl in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ari.example.com')
    vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(40))
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/db')

    const result = checkAuthConfig()

    expect(result.isProduction).toBe(true)
    expect(result.sslEnabled).toBe(true)
    expect(result.hasProductionOrigin).toBe(true)
    expect(result.rateLimitEnabled).toBe(true)
    // production does not add the localhost defaults
    expect(result.trustedOriginsCount).toBe(1)
    expect(result.environment.DATABASE_URL).toBe('Set')
  })
})

// ── checkAiProviders ───────────────────────────────────────────────────────

describe('checkAiProviders', () => {
  it('returns "none" when no provider has a key', async () => {
    providersHolder.providers = [{ id: 'openai', name: 'OpenAI', primaryEnvKey: 'OPENAI_API_KEY' }]
    vi.stubEnv('OPENAI_API_KEY', '')

    const result = await checkAiProviders(makeWithRLS([[]]))

    expect(result.status).toBe('none')
    expect(result.configuredCount).toBe(0)
    expect(result.providers[0]).toEqual({
      id: 'openai',
      name: 'OpenAI',
      configured: false,
      source: null,
    })
  })

  it('prefers an env key over a saved db value', async () => {
    providersHolder.providers = [{ id: 'openai', name: 'OpenAI', primaryEnvKey: 'OPENAI_API_KEY' }]
    vi.stubEnv('OPENAI_API_KEY', 'sk-live')

    const result = await checkAiProviders(makeWithRLS([[{ settings: { OPENAI_API_KEY: 'saved' } }]]))

    expect(result.status).toBe('ok')
    expect(result.configuredCount).toBe(1)
    expect(result.providers[0].source).toBe('env')
  })

  it('falls back to a saved db value when the env key is empty', async () => {
    providersHolder.providers = [{ id: 'anthropic', name: 'Anthropic', primaryEnvKey: 'ANTHROPIC_API_KEY' }]
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const result = await checkAiProviders(
      makeWithRLS([[{ settings: { ANTHROPIC_API_KEY: 'sk-saved' } }]])
    )

    expect(result.providers[0].source).toBe('db')
    expect(result.providers[0].configured).toBe(true)
  })

  it('ignores a non-string saved value and handles a missing settings row', async () => {
    providersHolder.providers = [{ id: 'openai', name: 'OpenAI', primaryEnvKey: 'OPENAI_API_KEY' }]
    vi.stubEnv('OPENAI_API_KEY', '')

    expect((await checkAiProviders(makeWithRLS([[{ settings: { OPENAI_API_KEY: 123 } }]]))).providers[0].source).toBe(null)
    // no row at all — the `?? {}` fallback
    expect((await checkAiProviders(makeWithRLS([[]]))).providers[0].source).toBe(null)
    // empty-string saved value is not "configured"
    expect((await checkAiProviders(makeWithRLS([[{ settings: { OPENAI_API_KEY: '' } }]]))).providers[0].source).toBe(null)
  })
})

// ── checkModuleStatus ──────────────────────────────────────────────────────

describe('checkModuleStatus', () => {
  it('marks a module disabled when the user has switched it off', async () => {
    registryHolder.modules = [
      { id: 'tasks', enabled: true },
      { id: 'notepad', enabled: true },
    ]
    const settings = [{ moduleId: 'notepad', enabled: false }]

    const result = await checkModuleStatus('user-1', makeWithRLS([settings]))

    expect(result.authenticated).toBe(true)
    expect(result.userId).toBe('user-1')
    expect(result.moduleChecks.tasks).toEqual({ exists: true, enabled: true })
    expect(result.moduleChecks.notepad).toEqual({ exists: true, enabled: false })
    expect(result.userSettings).toBe(settings)
  })

  it('honours the snake_case module_id key and a manifest-disabled module', async () => {
    registryHolder.modules = [
      { id: 'quotes', enabled: true },
      { id: 'legacy', enabled: false },
    ]

    const result = await checkModuleStatus(
      'user-2',
      makeWithRLS([[{ module_id: 'quotes', enabled: false }]])
    )

    expect(result.moduleChecks.quotes.enabled).toBe(false)
    expect(result.moduleChecks.legacy.enabled).toBe(false)
  })

  it('treats a module with no explicit enabled flag as enabled', async () => {
    registryHolder.modules = [{ id: 'chat' }]
    // a settings row that is enabled, plus one with neither id key
    const result = await checkModuleStatus(
      'user-3',
      makeWithRLS([[{ moduleId: 'chat', enabled: true }, { enabled: false }]])
    )
    expect(result.moduleChecks.chat.enabled).toBe(true)
  })
})

// ── checkMultiUser ─────────────────────────────────────────────────────────

describe('checkMultiUser', () => {
  it('returns null when no pool is configured', async () => {
    poolHolder.pool = null
    expect(await checkMultiUser()).toBeNull()
  })

  it('reports ok when the columns, function, and an active admin all exist', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ column_name: 'role' }, { column_name: 'permissions' }, { column_name: 'disabled' }],
      })
      .mockResolvedValueOnce({ rows: [{ present: true }] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
    poolHolder.pool = { query }

    const result = await checkMultiUser()

    expect(result).toEqual({
      ok: true,
      columnsPresent: true,
      missingColumns: [],
      sharedAccessFunction: true,
      activeAdminCount: 2,
      hasActiveAdmin: true,
    })
  })

  it('lists missing columns and skips the admin count when role/disabled are absent', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ column_name: 'permissions' }] })
      .mockResolvedValueOnce({ rows: [{ present: true }] })
    poolHolder.pool = { query }

    const result = await checkMultiUser()

    expect(result?.ok).toBe(false)
    expect(result?.columnsPresent).toBe(false)
    expect(result?.missingColumns).toEqual(['role', 'disabled'])
    expect(result?.activeAdminCount).toBeNull()
    expect(result?.hasActiveAdmin).toBe(false)
    // the admin-count query must not run
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('fails when the shared-access function is missing', async () => {
    poolHolder.pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ column_name: 'role' }, { column_name: 'permissions' }, { column_name: 'disabled' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }),
    }

    const result = await checkMultiUser()

    expect(result?.sharedAccessFunction).toBe(false)
    expect(result?.ok).toBe(false)
  })

  it('fails when no active admin remains, defaulting an empty count row to zero', async () => {
    poolHolder.pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ column_name: 'role' }, { column_name: 'permissions' }, { column_name: 'disabled' }],
        })
        .mockResolvedValueOnce({ rows: [{ present: true }] })
        .mockResolvedValueOnce({ rows: [] }),
    }

    const result = await checkMultiUser()

    expect(result?.activeAdminCount).toBe(0)
    expect(result?.hasActiveAdmin).toBe(false)
    expect(result?.ok).toBe(false)
  })
})

// ── checkStorageFilesystem ─────────────────────────────────────────────────

describe('checkStorageFilesystem', () => {
  it('is not applicable for a non-filesystem provider', async () => {
    storageHolder.config = { provider: 's3' }
    expect(await checkStorageFilesystem()).toEqual({ provider: 's3', applicable: false })
  })

  it('reports a writable path and cleans up its probe file', async () => {
    const result = await checkStorageFilesystem()

    expect(result).toMatchObject({
      provider: 'filesystem',
      applicable: true,
      basePath: '/tmp/ari-storage',
      exists: true,
      writable: true,
      isEphemeral: false,
    })
    expect(result.error).toBeUndefined()
    expect(fsHolder.unlink).toHaveBeenCalledTimes(1)
  })

  it('flags ephemeral storage', async () => {
    storageHolder.ephemeral = true
    expect((await checkStorageFilesystem()).isEphemeral).toBe(true)
  })

  it('surfaces an errno code when the write probe fails', async () => {
    const err: NodeJS.ErrnoException = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    })
    fsHolder.writeFile.mockRejectedValue(err)

    const result = await checkStorageFilesystem()

    expect(result.exists).toBe(true)
    expect(result.writable).toBe(false)
    expect(result.error).toBe('EACCES: permission denied')
  })

  it('falls back to the message when the error carries no code', async () => {
    fsHolder.mkdir.mockRejectedValue(new Error('disk gone'))
    const result = await checkStorageFilesystem()
    expect(result.exists).toBe(false)
    expect(result.error).toBe('disk gone')
  })

  it('stringifies a thrown non-error with no message', async () => {
    fsHolder.mkdir.mockRejectedValue({})
    expect((await checkStorageFilesystem()).error).toBe('[object Object]')
  })
})

// ── connectionBypassesRls ──────────────────────────────────────────────────

describe('connectionBypassesRls', () => {
  it('returns null with no pool', async () => {
    poolHolder.pool = null
    expect(await connectionBypassesRls()).toBeNull()
  })

  it('returns the role bypass flag', async () => {
    poolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [{ bypass: true }] }) }
    expect(await connectionBypassesRls()).toBe(true)
  })

  it('returns null when the role row is missing', async () => {
    poolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect(await connectionBypassesRls()).toBeNull()
  })

  it('swallows a query error and returns null', async () => {
    poolHolder.pool = { query: vi.fn().mockRejectedValue(new Error('no pg_roles')) }
    expect(await connectionBypassesRls()).toBeNull()
  })

  it('probes whichever pool it is given (the app pool, for the enforcing role)', async () => {
    poolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [{ bypass: true }] }) }
    const appPool = { query: vi.fn().mockResolvedValue({ rows: [{ bypass: false }] }) } as any
    expect(await connectionBypassesRls(appPool)).toBe(false)
    expect(await connectionBypassesRls(null)).toBeNull()
    expect(poolHolder.pool.query).not.toHaveBeenCalled()
  })
})

// ── checkAppRole ───────────────────────────────────────────────────────────

describe('checkAppRole', () => {
  const ownsNone = () => ({ query: vi.fn().mockResolvedValue({ rows: [{ n: 0 }] }) })

  it('reports an enforced, healthy app role', async () => {
    poolHolder.pool = ownsNone()
    const r = await checkAppRole()
    expect(r).toEqual({
      status: 'active',
      roleName: 'ari_app',
      enforced: true,
      appRoleBypassRls: false,
      reason: null,
      ownsNoTables: true,
      fallbackCount: 0,
      grantMissRetries: 0,
      rotatedAt: '2026-09-13T00:00:00.000Z',
      lastTransition: null,
    })
    expect(poolHolder.pool.query).toHaveBeenCalledWith(
      'SELECT count(*)::int AS n FROM pg_tables WHERE tableowner = $1',
      ['ari_app']
    )
    expect(appPoolHolder.getAppPool).not.toHaveBeenCalled()
  })

  it('resolves a never-attempted (pending) pool first', async () => {
    appPoolHolder.state.mode = 'pending'
    appPoolHolder.getAppPool.mockImplementation(async () => {
      appPoolHolder.state.mode = 'app'
      return appPoolHolder.pool
    })
    const r = await checkAppRole()
    expect(appPoolHolder.getAppPool).toHaveBeenCalledTimes(1)
    expect(r.status).toBe('active')
  })

  it('is NOT enforced when the app role itself can bypass RLS', async () => {
    appPoolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [{ bypass: true }] }) }
    const r = await checkAppRole()
    expect(r.status).toBe('active')
    expect(r.appRoleBypassRls).toBe(true)
    expect(r.enforced).toBe(false)
  })

  it('leaves the bypass probe null when the app pool is not active', async () => {
    appPoolHolder.state.mode = 'fallback'
    appPoolHolder.state.degradedReason = 'connect as the app role failed: 28P01'
    appPoolHolder.state.fallbackCount = 3
    appPoolHolder.state.lastTransition = { type: 'fallback', at: 5, reason: 'x' }
    const r = await checkAppRole()
    expect(r).toMatchObject({
      status: 'fallback',
      enforced: false,
      appRoleBypassRls: null,
      reason: 'connect as the app role failed: 28P01',
      fallbackCount: 3,
      lastTransition: { type: 'fallback', at: 5, reason: 'x' },
    })
    expect(appPoolHolder.pool.query).not.toHaveBeenCalled()
  })

  it.each([
    ['disabled', 'disabled'],
    ['unsupported', 'unsupported'],
    ['unavailable', 'unavailable'],
    ['pending', 'fallback'],
  ])('maps pool mode %s → %s', async (mode, expected) => {
    appPoolHolder.state.mode = mode
    appPoolHolder.getAppPool.mockImplementation(async () => null)
    expect((await checkAppRole()).status).toBe(expected)
  })

  it("falls back to the role's own reason when the pool has none", async () => {
    appPoolHolder.state.mode = 'unsupported'
    appRoleHolder.status = { state: 'unsupported', reason: 'no CREATEROLE', rotatedAt: null }
    expect((await checkAppRole()).reason).toBe('no CREATEROLE')
  })

  it('ownership check: false when the role owns a table, null on error or without a pool', async () => {
    poolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [{ n: 2 }] }) }
    expect((await checkAppRole()).ownsNoTables).toBe(false)
    poolHolder.pool = { query: vi.fn().mockRejectedValue(new Error('no pg_tables')) }
    expect((await checkAppRole()).ownsNoTables).toBeNull()
    poolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    expect((await checkAppRole()).ownsNoTables).toBe(true)
    poolHolder.pool = null
    expect((await checkAppRole()).ownsNoTables).toBeNull()
  })
})

// ── rlsEnforcementNote ─────────────────────────────────────────────────────

describe('rlsEnforcementNote', () => {
  const base: AppRolePayload = {
    status: 'active',
    roleName: 'ari_app',
    enforced: true,
    appRoleBypassRls: false,
    reason: null,
    ownsNoTables: true,
    fallbackCount: 0,
    grantMissRetries: 0,
    rotatedAt: null,
    lastTransition: null,
  }

  it('enforced → green wording naming the role', () => {
    expect(rlsEnforcementNote(base, true)).toMatch(/^RLS is enforced — request-path queries run as ari_app/)
  })

  it('privileged role that cannot bypass → legacy enforced wording', () => {
    expect(rlsEnforcementNote({ ...base, enforced: false, status: 'unsupported' }, false)).toContain(
      'actively enforced'
    )
  })

  it('active but the app role bypasses → loud remediation', () => {
    const note = rlsEnforcementNote({ ...base, enforced: false, appRoleBypassRls: true }, true)
    expect(note).toContain('NOT enforced')
    expect(note).toContain('ALTER ROLE ari_app NOBYPASSRLS')
  })

  it('active but the probe failed → could not be confirmed', () => {
    expect(rlsEnforcementNote({ ...base, enforced: false, appRoleBypassRls: null }, true)).toContain(
      'could not be confirmed'
    )
  })

  it('disabled / unsupported / fallback wording', () => {
    expect(rlsEnforcementNote({ ...base, enforced: false, status: 'disabled' }, true)).toContain(
      'ARI_DISABLE_APP_ROLE'
    )
    expect(rlsEnforcementNote({ ...base, enforced: false, status: 'unsupported' }, true)).toContain(
      'needs CREATEROLE'
    )
    const fb = rlsEnforcementNote({ ...base, enforced: false, status: 'fallback', reason: 'boom' }, true)
    expect(fb).toContain('in fallback')
    expect(fb).toContain('(boom)')
    expect(rlsEnforcementNote({ ...base, enforced: false, status: 'unavailable' }, null)).not.toContain('(')
  })
})

// ── runRlsTest ─────────────────────────────────────────────────────────────

describe('runRlsTest', () => {
  /**
   * withRLS call order: leftover delete, insert, positive select, then the
   * cleanup delete. The negative select goes through withUserContext.
   */
  function rlsSetup(opts: {
    positiveRows: unknown[]
    negativeRows: unknown[]
    insertedId?: string | null
    bypass?: boolean | null
  }) {
    dbHolder.userContextResults = [opts.negativeRows]
    poolHolder.pool =
      opts.bypass === undefined
        ? null
        : { query: vi.fn().mockResolvedValue({ rows: [{ bypass: opts.bypass }] }) }
    return makeWithRLS([
      undefined,
      opts.insertedId === null ? [] : [{ id: opts.insertedId ?? 'row-1' }],
      opts.positiveRows,
      undefined,
    ])
  }

  it('passes both tests when RLS is enforced', async () => {
    const withRLS = rlsSetup({
      positiveRows: [{ userId: 'user-1' }],
      negativeRows: [],
      bypass: false,
    })

    const result = await runRlsTest('user-1', withRLS)

    expect(result.success).toBe(true)
    expect(result.bypassRls).toBe(false)
    expect(result.servedBy).toBe('app-role')
    expect(result.enforced).toBe(true)
    expect(result.mode).toBe('app')
    expect(result.note).toContain('ran as ari_app')
    expect(result.positiveTest.passed).toBe(true)
    expect(result.positiveTest.allOwnedByCurrentUser).toBe(true)
    expect(result.negativeTest.passed).toBe(true)
    expect(result.negativeTest.fakeUserContext).toMatch(/^__debug_rls_fake_user_[0-9a-f]{32}__$/)
    expect(result.tableTested).toBe('module_settings')
    expect(result.note).toContain('fresh installs')
    // leftover delete, insert, positive select, cleanup delete
    expect(withRLS).toHaveBeenCalledTimes(4)
  })

  it('in fallback, a leak is excused when the privileged role bypasses RLS', async () => {
    appPoolHolder.state.mode = 'fallback'
    const result = await runRlsTest(
      'user-1',
      rlsSetup({
        positiveRows: [{ userId: 'user-1' }],
        negativeRows: [{ userId: 'user-1' }],
        bypass: true,
      })
    )

    expect(result.success).toBe(true)
    expect(result.servedBy).toBe('privileged')
    expect(result.enforced).toBe(false)
    expect(result.mode).toBe('fallback')
    expect(result.negativeTest.passed).toBe(false)
    expect(result.note).toContain('bypasses RLS')
    expect(result.note).toContain('app pool in fallback')
  })

  it.each([
    ['disabled', 'kill switch'],
    ['unsupported', 'app role unsupported here'],
  ])('names the reason the privileged role served the test (%s)', async (mode, phrase) => {
    appPoolHolder.state.mode = mode
    const result = await runRlsTest(
      'user-1',
      rlsSetup({ positiveRows: [{ userId: 'user-1' }], negativeRows: [{ userId: 'user-1' }], bypass: true })
    )
    expect(result.success).toBe(true)
    expect(result.note).toContain(phrase)
  })

  it('on the app role a leak FAILS even though the privileged role bypasses RLS', async () => {
    const result = await runRlsTest(
      'user-1',
      rlsSetup({
        positiveRows: [{ userId: 'user-1' }],
        negativeRows: [{ userId: 'user-1' }],
        bypass: true,
      })
    )

    expect(result.success).toBe(false)
    expect(result.servedBy).toBe('app-role')
    expect(result.enforced).toBe(true)
  })

  it('detects a mid-test fallback through the counter and excuses accordingly', async () => {
    const withRLS = rlsSetup({
      positiveRows: [{ userId: 'user-1' }],
      negativeRows: [{ userId: 'user-1' }],
      bypass: true,
    })
    const inner = withRLS.getMockImplementation()!
    withRLS.mockImplementation(async (op) => {
      appPoolHolder.state.fallbackCount += 1 // this call ran on the privileged pool
      return inner(op)
    })

    const result = await runRlsTest('user-1', withRLS as unknown as WithRLS)

    expect(result.servedBy).toBe('privileged')
    expect(result.enforced).toBe(false)
    expect(result.success).toBe(true)
  })

  it('without a bypassing privileged role, a fallback leak still fails', async () => {
    appPoolHolder.state.mode = 'fallback'
    const result = await runRlsTest(
      'user-1',
      rlsSetup({ positiveRows: [{ userId: 'user-1' }], negativeRows: [{ userId: 'user-1' }], bypass: null })
    )
    expect(result.success).toBe(false)
    expect(result.note).toContain('sentinel row')
  })

  it('fails when the negative test leaks and the role does not bypass RLS', async () => {
    const result = await runRlsTest(
      'user-1',
      rlsSetup({
        positiveRows: [{ userId: 'user-1' }],
        negativeRows: [{ userId: 'user-1' }],
        bypass: false,
      })
    )

    expect(result.success).toBe(false)
    expect(result.negativeTest.rowCount).toBe(1)
  })

  it('fails when the user cannot read their own row', async () => {
    const result = await runRlsTest(
      'user-1',
      rlsSetup({ positiveRows: [], negativeRows: [], bypass: false })
    )

    expect(result.success).toBe(false)
    expect(result.positiveTest.passed).toBe(false)
    expect(result.positiveTest.allOwnedByCurrentUser).toBe(false)
  })

  it('fails when the returned row belongs to a different user', async () => {
    const result = await runRlsTest(
      'user-1',
      rlsSetup({ positiveRows: [{ userId: 'someone-else' }], negativeRows: [], bypass: false })
    )
    expect(result.positiveTest.passed).toBe(false)
    expect(result.positiveTest.allOwnedByCurrentUser).toBe(false)
  })

  it('skips cleanup when the insert returned no id', async () => {
    const withRLS = rlsSetup({
      positiveRows: [{ userId: 'user-1' }],
      negativeRows: [],
      insertedId: null,
      bypass: false,
    })

    await runRlsTest('user-1', withRLS)

    // leftover delete, insert, positive select — no cleanup delete
    expect(withRLS).toHaveBeenCalledTimes(3)
  })

  it('logs but does not throw when cleanup fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dbHolder.userContextResults = [[]]
    poolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [{ bypass: false }] }) }

    let call = 0
    const withRLS = vi.fn(async (op: (db: any) => Promise<any>) => {
      call += 1
      if (call === 4) throw new Error('cleanup blew up')
      const results: unknown[] = [undefined, [{ id: 'row-1' }], [{ userId: 'user-1' }]]
      return op(queryableImpl(results[call - 1]))
    })

    const result = await runRlsTest('user-1', withRLS)

    expect(result.success).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      '[Debug RLS] Failed to clean up sentinel row:',
      expect.any(Error)
    )
  })

  it('propagates a failure from the positive select after attempting cleanup', async () => {
    dbHolder.userContextResults = [[]]
    let call = 0
    const withRLS = vi.fn(async (op: (db: any) => Promise<any>) => {
      call += 1
      if (call === 3) throw new Error('select failed')
      const results: unknown[] = [undefined, [{ id: 'row-1' }]]
      return op(queryableImpl(results[call - 1]))
    })

    await expect(runRlsTest('user-1', withRLS)).rejects.toThrow('select failed')
    // cleanup still ran for the inserted row
    expect(withRLS).toHaveBeenCalledTimes(4)
  })
})

// ── buildTableModuleMap ────────────────────────────────────────────────────

describe('buildTableModuleMap', () => {
  it('maps quoted and unquoted CREATE TABLE names to their module', () => {
    const map = buildTableModuleMap({
      tasks: 'CREATE TABLE IF NOT EXISTS "tasks" (id UUID);',
      agents: 'create table if not exists agents (id TEXT);\nCREATE TABLE IF NOT EXISTS agent_runs (id TEXT);',
    })
    expect(map.get('tasks')).toBe('tasks')
    expect(map.get('agents')).toBe('agents')
    expect(map.get('agent_runs')).toBe('agents')
  })

  it('keeps the first claimant when two modules declare the same table', () => {
    const map = buildTableModuleMap({
      first: 'CREATE TABLE IF NOT EXISTS shared_tbl (id TEXT);',
      second: 'CREATE TABLE IF NOT EXISTS shared_tbl (id TEXT);',
    })
    expect(map.get('shared_tbl')).toBe('first')
  })

  it('ignores SQL without CREATE TABLE statements', () => {
    expect(buildTableModuleMap({ empty: 'ALTER TABLE x ADD COLUMN y TEXT;' }).size).toBe(0)
  })
})

// ── checkRlsTables ─────────────────────────────────────────────────────────

describe('checkRlsTables', () => {
  /** pool.query stub that serves the catalog scan and the pg_roles bypass probe. */
  function rlsTablesPool(catalogRows: unknown[], bypass: boolean | null) {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('pg_roles')) return { rows: bypass === null ? [] : [{ bypass }] }
        if (sql.includes('pg_tables')) return { rows: [{ n: 0 }] }
        return { rows: catalogRows }
      }),
    }
  }

  it('returns null with no pool', async () => {
    poolHolder.pool = null
    expect(await checkRlsTables()).toBeNull()
  })

  it('classifies tables and attributes them to modules', async () => {
    schemasHolder.schemas = { agents: 'CREATE TABLE IF NOT EXISTS agents (id TEXT);' }
    poolHolder.pool = rlsTablesPool(
      [
        { table_name: 'agents', rls_enabled: true, rls_forced: false, policy_count: 4 },
        { table_name: 'tasks', rls_enabled: true, rls_forced: true, policy_count: 0 },
        { table_name: 'quotes', rls_enabled: false, rls_forced: false, policy_count: 0 },
        { table_name: 'user', rls_enabled: false, rls_forced: false, policy_count: 0 },
      ],
      true
    )

    const result = await checkRlsTables()

    expect(result).not.toBeNull()
    expect(result!.tables).toEqual([
      { table: 'agents', module: 'agents', rlsEnabled: true, rlsForced: false, policyCount: 4, status: 'ok' },
      { table: 'tasks', module: 'core', rlsEnabled: true, rlsForced: true, policyCount: 0, status: 'no_policies' },
      { table: 'quotes', module: 'core', rlsEnabled: false, rlsForced: false, policyCount: 0, status: 'disabled' },
      { table: 'user', module: 'core', rlsEnabled: false, rlsForced: false, policyCount: 0, status: 'system' },
    ])
    expect(result!.summary).toEqual({ total: 4, ok: 1, noPolicies: 1, disabled: 1, system: 1 })
    // the privileged role bypasses, but the request path runs as the app role
    expect(result!.bypassRls).toBe(true)
    expect(result!.enforced).toBe(true)
    expect(result!.appRole).toMatchObject({ status: 'active', enforced: true, ownsNoTables: true })
    expect(result!.note).toMatch(/^RLS is enforced/)
  })

  it('reports enforcement when the privileged role itself does not bypass RLS', async () => {
    appPoolHolder.state.mode = 'unsupported'
    poolHolder.pool = rlsTablesPool(
      [{ table_name: 'tasks', rls_enabled: true, rls_forced: true, policy_count: 2 }],
      false
    )

    const result = await checkRlsTables()

    expect(result!.enforced).toBe(true)
    expect(result!.bypassRls).toBe(false)
    expect(result!.appRole.status).toBe('unsupported')
    expect(result!.note).toContain('actively enforced')
  })

  it('fallback: not enforced, calm note with the reason, privileged bypass unknown', async () => {
    appPoolHolder.state.mode = 'fallback'
    appPoolHolder.state.degradedReason = 'connect as the app role failed'
    poolHolder.pool = rlsTablesPool([], null)

    const result = await checkRlsTables()

    expect(result!.bypassRls).toBeNull()
    expect(result!.enforced).toBe(false)
    expect(result!.appRole.status).toBe('fallback')
    expect(result!.note).toContain('in fallback')
    expect(result!.note).toContain('connect as the app role failed')
    expect(result!.summary.total).toBe(0)
  })

  it('kill switch and unsupported installs get their own wording', async () => {
    poolHolder.pool = rlsTablesPool([], true)
    appPoolHolder.state.mode = 'disabled'
    expect((await checkRlsTables())!.note).toContain('ARI_DISABLE_APP_ROLE')
    appPoolHolder.state.mode = 'unsupported'
    expect((await checkRlsTables())!.note).toContain('unavailable on this database')
  })

  it('an app role that can bypass RLS is reported loudly, never as enforced', async () => {
    poolHolder.pool = rlsTablesPool([], true)
    appPoolHolder.pool = { query: vi.fn().mockResolvedValue({ rows: [{ bypass: true }] }) }

    const result = await checkRlsTables()

    expect(result!.enforced).toBe(false)
    expect(result!.appRole.appRoleBypassRls).toBe(true)
    expect(result!.note).toContain('NOT enforced')
  })
})
