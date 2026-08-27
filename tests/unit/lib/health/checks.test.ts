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
  checkAiProviders,
  checkAuthConfig,
  checkDatabase,
  checkModuleStatus,
  checkMultiUser,
  checkStorageFilesystem,
  connectionBypassesRls,
  runRlsTest,
  type WithRLS,
} from '@/lib/health/checks'

/** Build a withRLS stub that serves `results` in order. */
function makeWithRLS(results: unknown[]) {
  const queue = [...results]
  const fn = vi.fn(async (op: (db: any) => Promise<any>) => op(queryableImpl(queue.shift())))
  return fn as typeof fn & WithRLS
}

beforeEach(() => {
  poolHolder.pool = null
  dbHolder.userContextResults = []
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
    expect(result.positiveTest.passed).toBe(true)
    expect(result.positiveTest.allOwnedByCurrentUser).toBe(true)
    expect(result.negativeTest.passed).toBe(true)
    expect(result.negativeTest.fakeUserContext).toMatch(/^__debug_rls_fake_user_[0-9a-f]{32}__$/)
    expect(result.tableTested).toBe('module_settings')
    expect(result.note).toContain('fresh installs')
    // leftover delete, insert, positive select, cleanup delete
    expect(withRLS).toHaveBeenCalledTimes(4)
  })

  it('still succeeds when the negative test leaks because the role bypasses RLS', async () => {
    const result = await runRlsTest(
      'user-1',
      rlsSetup({
        positiveRows: [{ userId: 'user-1' }],
        negativeRows: [{ userId: 'user-1' }],
        bypass: true,
      })
    )

    expect(result.success).toBe(true)
    expect(result.negativeTest.passed).toBe(false)
    expect(result.note).toContain('bypasses RLS')
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
