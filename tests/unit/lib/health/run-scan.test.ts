/**
 * Full coverage for lib/health/run-scan.ts — the aggregate scan's
 * normalisation of each check into ok / warn / fail / skip.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const checks = vi.hoisted(() => ({
  checkDatabase: vi.fn(),
  checkAuthConfig: vi.fn(),
  checkMultiUser: vi.fn(),
  runRlsTest: vi.fn(),
  checkAppRole: vi.fn(),
  checkStorageFilesystem: vi.fn(),
  checkModuleStatus: vi.fn(),
  checkAiProviders: vi.fn(),
}))
vi.mock('@/lib/health/checks', () => checks)

import { runHealthScan, HEALTH_CHECK_IDS } from '@/lib/health/run-scan'

const ctx = { userId: 'user-1', withRLS: (async (op: any) => op({})) as any }

/** Put every check in a passing state; individual tests override one. */
function allHealthy() {
  checks.checkDatabase.mockResolvedValue({ status: 'ok', checks: { database: { status: 'ok' } } })
  checks.checkAuthConfig.mockReturnValue({
    isProduction: false,
    secretConfigured: true,
    databaseConfigured: true,
    hasProductionOrigin: false,
  })
  checks.checkMultiUser.mockResolvedValue({
    ok: true,
    columnsPresent: true,
    missingColumns: [],
    sharedAccessFunction: true,
    activeAdminCount: 1,
    hasActiveAdmin: true,
  })
  checks.runRlsTest.mockResolvedValue({
    success: true,
    bypassRls: true,
    servedBy: 'app-role',
    enforced: true,
    positiveTest: { passed: true },
    negativeTest: { passed: true },
  })
  checks.checkAppRole.mockResolvedValue(healthyAppRole())
  checks.checkStorageFilesystem.mockResolvedValue({
    provider: 'filesystem',
    applicable: true,
    basePath: '/data',
    exists: true,
    writable: true,
    isEphemeral: false,
  })
  checks.checkModuleStatus.mockResolvedValue({
    allModules: [{ id: 'a' }, { id: 'b' }],
    moduleChecks: { a: { exists: true, enabled: true }, b: { exists: true, enabled: false } },
  })
  checks.checkAiProviders.mockResolvedValue({ status: 'ok', configuredCount: 1, providers: [] })
}

function healthyAppRole() {
  return {
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
}

/** Look one check up by id in a scan result. */
const byId = (result: Awaited<ReturnType<typeof runHealthScan>>, id: string) =>
  result.checks.find((c) => c.id === id)!

beforeEach(() => {
  vi.clearAllMocks()
  allHealthy()
})

describe('runHealthScan — shape', () => {
  it('returns every registered check with timing and an ok aggregate', async () => {
    const result = await runHealthScan(ctx)

    expect(result.status).toBe('ok')
    expect(result.checks.map((c) => c.id)).toEqual(HEALTH_CHECK_IDS)
    expect(result.summary).toEqual({ total: 8, ok: 8, warn: 0, fail: 0, skip: 0 })
    expect(Date.parse(result.startedAt)).not.toBeNaN()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    for (const c of result.checks) {
      expect(c.durationMs).toBeGreaterThanOrEqual(0)
      expect(c.message).toBeTruthy()
    }
  })

  it('passes the scan context through to the checks that need it', async () => {
    await runHealthScan(ctx)
    expect(checks.checkModuleStatus).toHaveBeenCalledWith('user-1', ctx.withRLS)
    expect(checks.runRlsTest).toHaveBeenCalledWith('user-1', ctx.withRLS)
    expect(checks.checkAiProviders).toHaveBeenCalledWith(ctx.withRLS)
  })

  it('converts a thrown check into a fail instead of aborting the scan', async () => {
    checks.checkDatabase.mockRejectedValue(new Error('pool exploded'))

    const result = await runHealthScan(ctx)

    expect(byId(result, 'database')).toMatchObject({ status: 'fail', message: 'pool exploded' })
    // the other seven still ran
    expect(result.summary.ok).toBe(7)
    expect(result.status).toBe('fail')
  })
})

describe('runHealthScan — database', () => {
  it('fails with the underlying message', async () => {
    checks.checkDatabase.mockResolvedValue({
      status: 'error',
      checks: { database: { status: 'error', message: 'DATABASE_URL not configured' } },
    })
    const result = await runHealthScan(ctx)
    expect(byId(result, 'database')).toMatchObject({
      status: 'fail',
      message: 'DATABASE_URL not configured',
    })
  })

  it('falls back to a generic message when none is supplied', async () => {
    checks.checkDatabase.mockResolvedValue({ status: 'error', checks: {} })
    const result = await runHealthScan(ctx)
    expect(byId(result, 'database').message).toBe('Database check failed')
  })
})

describe('runHealthScan — auth config', () => {
  it('fails when the secret is missing', async () => {
    checks.checkAuthConfig.mockReturnValue({
      isProduction: false,
      secretConfigured: false,
      databaseConfigured: true,
      hasProductionOrigin: false,
    })
    const result = await runHealthScan(ctx)
    expect(byId(result, 'auth-config').status).toBe('fail')
    expect(byId(result, 'auth-config').message).toContain('BETTER_AUTH_SECRET')
  })

  it('lists both missing values', async () => {
    checks.checkAuthConfig.mockReturnValue({
      isProduction: false,
      secretConfigured: false,
      databaseConfigured: false,
      hasProductionOrigin: false,
    })
    const result = await runHealthScan(ctx)
    expect(byId(result, 'auth-config').message).toContain('DATABASE_URL')
  })

  it('warns in production without a real origin', async () => {
    checks.checkAuthConfig.mockReturnValue({
      isProduction: true,
      secretConfigured: true,
      databaseConfigured: true,
      hasProductionOrigin: false,
    })
    const result = await runHealthScan(ctx)
    expect(byId(result, 'auth-config').status).toBe('warn')
    expect(result.status).toBe('warn')
  })

  it('passes in production with a real origin', async () => {
    checks.checkAuthConfig.mockReturnValue({
      isProduction: true,
      secretConfigured: true,
      databaseConfigured: true,
      hasProductionOrigin: true,
    })
    expect(byId(await runHealthScan(ctx), 'auth-config').status).toBe('ok')
  })
})

describe('runHealthScan — multi-user', () => {
  it('fails when the pool is unavailable', async () => {
    checks.checkMultiUser.mockResolvedValue(null)
    const result = await runHealthScan(ctx)
    expect(byId(result, 'multi-user')).toMatchObject({
      status: 'fail',
      message: 'Database not available',
    })
    expect(byId(result, 'multi-user').details).toBeUndefined()
  })

  it('reports each distinct problem', async () => {
    checks.checkMultiUser.mockResolvedValue({
      ok: false,
      columnsPresent: false,
      missingColumns: ['role', 'disabled'],
      sharedAccessFunction: false,
      activeAdminCount: 0,
      hasActiveAdmin: false,
    })
    const message = byId(await runHealthScan(ctx), 'multi-user').message
    expect(message).toContain('missing user columns: role, disabled')
    expect(message).toContain('app.can_access_shared() missing')
    expect(message).toContain('no active admin')
  })

  it('reports only the failing admin invariant when the schema is fine', async () => {
    checks.checkMultiUser.mockResolvedValue({
      ok: false,
      columnsPresent: true,
      missingColumns: [],
      sharedAccessFunction: true,
      activeAdminCount: 0,
      hasActiveAdmin: false,
    })
    expect(byId(await runHealthScan(ctx), 'multi-user').message).toBe('no active admin')
  })

  it('omits the admin problem when an admin exists but the schema is incomplete', async () => {
    checks.checkMultiUser.mockResolvedValue({
      ok: false,
      columnsPresent: false,
      missingColumns: ['permissions'],
      sharedAccessFunction: true,
      activeAdminCount: 1,
      hasActiveAdmin: true,
    })
    expect(byId(await runHealthScan(ctx), 'multi-user').message).toBe(
      'missing user columns: permissions'
    )
  })

  it('mentions the admin count on success', async () => {
    expect(byId(await runHealthScan(ctx), 'multi-user').message).toBe(
      'Schema present, 1 active admin(s)'
    )
  })
})

describe('runHealthScan — RLS', () => {
  it('says the test ran as the app role when enforcement is live', async () => {
    expect(byId(await runHealthScan(ctx), 'rls').message).toBe(
      'Positive and negative isolation tests passed as the app role (RLS enforced by Postgres)'
    )
  })

  it('notes when the (fallback) role bypasses RLS', async () => {
    checks.runRlsTest.mockResolvedValue({
      success: true,
      bypassRls: true,
      servedBy: 'privileged',
      enforced: false,
      positiveTest: { passed: true },
      negativeTest: { passed: false },
    })
    expect(byId(await runHealthScan(ctx), 'rls').message).toContain('app layer enforces isolation')
  })

  it('plain pass wording when a non-bypassing privileged role served the test', async () => {
    checks.runRlsTest.mockResolvedValue({
      success: true,
      bypassRls: false,
      servedBy: 'privileged',
      enforced: false,
      positiveTest: { passed: true },
      negativeTest: { passed: true },
    })
    expect(byId(await runHealthScan(ctx), 'rls').message).toBe(
      'Positive and negative isolation tests passed'
    )
  })

  it('fails on a leaking negative test', async () => {
    checks.runRlsTest.mockResolvedValue({
      success: false,
      bypassRls: false,
      positiveTest: { passed: true },
      negativeTest: { passed: false },
    })
    const check = byId(await runHealthScan(ctx), 'rls')
    expect(check.status).toBe('fail')
    expect(check.message).toContain('Negative isolation test failed')
  })

  it('fails distinctly when the positive test fails', async () => {
    checks.runRlsTest.mockResolvedValue({
      success: false,
      bypassRls: false,
      positiveTest: { passed: false },
      negativeTest: { passed: true },
    })
    expect(byId(await runHealthScan(ctx), 'rls').message).toContain('cannot read their own row')
  })
})

describe('runHealthScan — RLS enforcement (app role)', () => {
  it('ok when the app role serves requests and cannot bypass', async () => {
    const check = byId(await runHealthScan(ctx), 'app-role')
    expect(check.status).toBe('ok')
    expect(check.message).toBe('Request-path queries run as ari_app (RLS enforced by Postgres)')
  })

  it.each([
    ['disabled', 'ARI_DISABLE_APP_ROLE', false],
    ['unsupported', 'no CREATEROLE', false],
    ['unavailable', 'not provisioned yet', true],
    ['fallback', 'Fallback to the privileged role', true],
  ])('%s is warning-level, never red', async (status, phrase, carriesReason) => {
    checks.checkAppRole.mockResolvedValue({ ...healthyAppRole(), status, enforced: false, reason: 'why' })
    const result = await runHealthScan(ctx)
    const check = byId(result, 'app-role')
    expect(check.status).toBe('warn')
    expect(check.message).toContain(phrase)
    expect(check.message.includes('why')).toBe(carriesReason)
    expect(result.status).toBe('warn')
  })

  it('fallback without a reason keeps a plain message', async () => {
    checks.checkAppRole.mockResolvedValue({ ...healthyAppRole(), status: 'fallback', enforced: false })
    expect(byId(await runHealthScan(ctx), 'app-role').message).toBe('Fallback to the privileged role')
    checks.checkAppRole.mockResolvedValue({ ...healthyAppRole(), status: 'unavailable', enforced: false })
    expect(byId(await runHealthScan(ctx), 'app-role').message).toBe(
      'ari_app not provisioned yet — running on the privileged role'
    )
  })

  it('fails loudly when the app role can bypass RLS or cannot be verified', async () => {
    checks.checkAppRole.mockResolvedValue({ ...healthyAppRole(), enforced: false, appRoleBypassRls: true })
    let check = byId(await runHealthScan(ctx), 'app-role')
    expect(check.status).toBe('fail')
    expect(check.message).toContain('revoke it')
    checks.checkAppRole.mockResolvedValue({ ...healthyAppRole(), enforced: false, appRoleBypassRls: null })
    check = byId(await runHealthScan(ctx), 'app-role')
    expect(check.status).toBe('fail')
    expect(check.message).toContain('could not be verified')
  })
})

describe('runHealthScan — filesystem storage', () => {
  it('skips a non-filesystem provider without affecting the aggregate', async () => {
    checks.checkStorageFilesystem.mockResolvedValue({ provider: 's3', applicable: false })

    const result = await runHealthScan(ctx)

    expect(byId(result, 'storage-filesystem').status).toBe('skip')
    expect(byId(result, 'storage-filesystem').message).toContain('"s3"')
    expect(result.summary.skip).toBe(1)
    expect(result.status).toBe('ok')
  })

  it('fails on a probe error', async () => {
    checks.checkStorageFilesystem.mockResolvedValue({
      provider: 'filesystem',
      applicable: true,
      basePath: '/data',
      writable: false,
      error: 'EACCES: permission denied',
    })
    expect(byId(await runHealthScan(ctx), 'storage-filesystem').message).toBe(
      'EACCES: permission denied'
    )
  })

  it('fails with the path when it is simply not writable', async () => {
    checks.checkStorageFilesystem.mockResolvedValue({
      provider: 'filesystem',
      applicable: true,
      basePath: '/data',
      writable: false,
    })
    expect(byId(await runHealthScan(ctx), 'storage-filesystem').message).toBe(
      'Not writable: /data'
    )
  })

  it('warns on ephemeral storage', async () => {
    checks.checkStorageFilesystem.mockResolvedValue({
      provider: 'filesystem',
      applicable: true,
      basePath: '/data',
      writable: true,
      isEphemeral: true,
    })
    expect(byId(await runHealthScan(ctx), 'storage-filesystem').status).toBe('warn')
  })
})

describe('runHealthScan — modules and AI providers', () => {
  it('counts enabled modules', async () => {
    expect(byId(await runHealthScan(ctx), 'modules').message).toBe('1 of 2 modules enabled')
  })

  it('warns when no AI provider is configured', async () => {
    checks.checkAiProviders.mockResolvedValue({ status: 'none', configuredCount: 0, providers: [] })
    const result = await runHealthScan(ctx)
    expect(byId(result, 'ai-providers')).toMatchObject({
      status: 'warn',
      message: 'No AI provider configured',
    })
    expect(result.status).toBe('warn')
  })

  it('reports the configured provider count', async () => {
    checks.checkAiProviders.mockResolvedValue({ status: 'ok', configuredCount: 3, providers: [] })
    expect(byId(await runHealthScan(ctx), 'ai-providers').message).toBe('3 provider(s) configured')
  })
})

describe('runHealthScan — aggregate status precedence', () => {
  it('fail outranks warn', async () => {
    checks.checkAiProviders.mockResolvedValue({ status: 'none', configuredCount: 0, providers: [] })
    checks.checkDatabase.mockResolvedValue({ status: 'error', checks: {} })

    const result = await runHealthScan(ctx)

    expect(result.status).toBe('fail')
    expect(result.summary).toMatchObject({ warn: 1, fail: 1 })
  })
})
