/**
 * Tests for lib/modules/module-registry.ts
 *
 * All externals are mocked (next/headers, better-auth, drizzle DB, schema-installer,
 * module-loader). We test the observable branch behaviour of the exported functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── hoisted mocks ─────────────────────────────────────────────────────────────
// Variables used inside vi.mock() factories must be hoisted so they're
// initialized before the factory runs.

const {
  mockInsert,
  mockUpdate,
  mockLoadModules,
  mockRunModuleSchemaInstall,
  mockGetSession,
  mockWithAdminDbFn,
} = vi.hoisted(() => {
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()

  // withAdminDb: call the passed callback with a fake db object
  const mockWithAdminDbFn = vi.fn((fn: (db: any) => any) => {
    return fn({ insert: mockInsert, update: mockUpdate, select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }) })
  })

  return {
    mockInsert,
    mockUpdate,
    mockLoadModules: vi.fn(),
    mockRunModuleSchemaInstall: vi.fn(),
    mockGetSession: vi.fn(),
    mockWithAdminDbFn,
  }
})

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}))

vi.mock('@/lib/db', () => ({
  withAdminDb: mockWithAdminDbFn,
}))

vi.mock('@/lib/db/schema', () => ({
  moduleSettings: {
    userId: 'userId',
    moduleId: 'moduleId',
    settings: 'settings',
    enabled: 'enabled',
    updatedAt: 'updatedAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: any, b: any) => ({ eq: [a, b] })),
  and: vi.fn((...args: any[]) => ({ and: args })),
  sql: vi.fn(() => ({ sql: true })),
}))

vi.mock('@/lib/modules/schema-installer', () => ({
  runModuleSchemaInstall: mockRunModuleSchemaInstall,
}))

vi.mock('@/lib/modules/module-loader', () => ({
  loadModules: mockLoadModules,
}))

// ── import SUT ────────────────────────────────────────────────────────────────
import {
  getModules,
  bootstrapModuleSettings,
  setModuleEnabled,
  getEnabledModules,
  getEnabledModule,
} from '@/lib/modules/module-registry'

// ── fixture helpers ───────────────────────────────────────────────────────────

function makeModule(overrides: Partial<any> = {}): any {
  return {
    id: 'test-module',
    name: 'Test Module',
    isValid: true,
    isOverridden: false,
    enabled: true,
    path: 'modules-core/test-module',
    errors: [],
    isEnabled: true,
    ...overrides,
  }
}

function makeInsertChain() {
  const chain: any = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  }
  return chain
}

function makeUpdateChain() {
  const chain: any = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  return chain
}

function setupWithAdminDb(selectRows: any[] = []) {
  mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
    const insertChain = makeInsertChain()
    const updateChain = makeUpdateChain()
    mockInsert.mockReturnValue(insertChain)
    mockUpdate.mockReturnValue(updateChain)
    const db = {
      insert: mockInsert,
      update: mockUpdate,
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(selectRows),
      }),
    }
    return fn(db)
  })
}

// ── getModules ────────────────────────────────────────────────────────────────

describe('getModules', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates to loadModules and returns the modules array', async () => {
    const mod = makeModule()
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    const result = await getModules()
    expect(result).toEqual([mod])
  })

  it('returns empty array when no modules exist', async () => {
    mockLoadModules.mockResolvedValue({ modules: [], errors: [] })
    const result = await getModules()
    expect(result).toEqual([])
  })
})

// ── bootstrapModuleSettings ───────────────────────────────────────────────────

describe('bootstrapModuleSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when all module IDs are already in existingModuleIds', async () => {
    const mod = makeModule({ id: 'tasks' })
    await bootstrapModuleSettings('user-1', [mod], new Set(['tasks']))
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('does nothing for overridden modules', async () => {
    const mod = makeModule({ id: 'tasks', isOverridden: true })
    await bootstrapModuleSettings('user-1', [mod], new Set())
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts records for unseeded non-overridden modules', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    // Capture values() call args to verify the row was inserted correctly
    const capturedArgs: any[] = []
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const insertChain: any = {
        values: vi.fn().mockImplementation((rows: any) => {
          capturedArgs.push(rows)
          return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
        }),
      }
      const db = {
        insert: vi.fn().mockReturnValue(insertChain),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }),
      }
      return fn(db)
    })

    await bootstrapModuleSettings('user-1', [mod], new Set())

    expect(capturedArgs.length).toBeGreaterThan(0)
    expect(capturedArgs[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'user-1', moduleId: 'tasks' }),
      ])
    )
  })

  it('defaults enabled=false for custom modules', async () => {
    const mod = makeModule({ id: 'my-custom', path: 'modules-custom/my-custom', enabled: true })

    const capturedArgs: any[] = []
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const insertChain: any = {
        values: vi.fn().mockImplementation((rows: any) => {
          capturedArgs.push(rows)
          return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
        }),
      }
      const db = {
        insert: vi.fn().mockReturnValue(insertChain),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }),
      }
      return fn(db)
    })

    await bootstrapModuleSettings('user-1', [mod], new Set())

    expect(capturedArgs.length).toBeGreaterThan(0)
    expect(capturedArgs[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ enabled: false }),
      ])
    )
    // Custom modules disabled by default — schema install skipped
    expect(mockRunModuleSchemaInstall).not.toHaveBeenCalled()
  })

  it('defaults enabled=true for core modules with undefined enabled field', async () => {
    const mod = makeModule({ id: 'core-mod', path: 'modules-core/core-mod', enabled: undefined })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    const capturedArgs: any[] = []
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const insertChain: any = {
        values: vi.fn().mockImplementation((rows: any) => {
          capturedArgs.push(rows)
          return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
        }),
      }
      const db = {
        insert: vi.fn().mockReturnValue(insertChain),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }),
      }
      return fn(db)
    })

    await bootstrapModuleSettings('user-1', [mod], new Set())

    expect(capturedArgs.length).toBeGreaterThan(0)
    expect(capturedArgs[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ enabled: true }),
      ])
    )
  })

  it('does not run schema installer when module has no schemaSha256', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: undefined })
    const insertChain = makeInsertChain()
    mockInsert.mockReturnValue(insertChain)
    setupWithAdminDb()

    await bootstrapModuleSettings('user-1', [mod], new Set())
    expect(mockRunModuleSchemaInstall).not.toHaveBeenCalled()
  })

  it('runs schema installer when module has schemaSha256 and is enabled', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'abc123' })
    const insertChain = makeInsertChain()
    mockInsert.mockReturnValue(insertChain)
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })
    setupWithAdminDb()

    await bootstrapModuleSettings('user-1', [mod], new Set())
    expect(mockRunModuleSchemaInstall).toHaveBeenCalledWith('tasks')
  })

  it('handles DB insert error gracefully (non-fatal)', async () => {
    const mod = makeModule({ id: 'tasks' })
    mockWithAdminDbFn.mockImplementationOnce(() => { throw new Error('db error') })

    // Should not throw
    await expect(
      bootstrapModuleSettings('user-1', [mod], new Set())
    ).resolves.toBeUndefined()
  })
})

// ── setModuleEnabled ──────────────────────────────────────────────────────────

describe('setModuleEnabled', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when module does not exist', async () => {
    mockLoadModules.mockResolvedValue({ modules: [], errors: [] })
    const result = await setModuleEnabled('nonexistent', 'user-1', true)
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('nonexistent') })
  })

  it('runs schema installer when enabling a module', async () => {
    const mod = makeModule({ id: 'tasks', schemaSha256: 'hash123' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })
    setupWithAdminDb()

    const result = await setModuleEnabled('tasks', 'user-1', true)
    expect(mockRunModuleSchemaInstall).toHaveBeenCalledWith('tasks')
    expect(result.success).toBe(true)
  })

  it('does not run schema installer when disabling a module', async () => {
    const mod = makeModule({ id: 'tasks', schemaSha256: 'hash123' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    setupWithAdminDb()

    await setModuleEnabled('tasks', 'user-1', false)
    expect(mockRunModuleSchemaInstall).not.toHaveBeenCalled()
  })

  it('returns error when schema install fails with non-alreadyExisted error', async () => {
    const mod = makeModule({ id: 'tasks' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: false, alreadyExisted: false, error: 'syntax error' })

    const result = await setModuleEnabled('tasks', 'user-1', true)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/syntax error/)
  })

  it('returns success with warning when alreadyExisted=true', async () => {
    const mod = makeModule({ id: 'tasks', schemaSha256: 'abc' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: false, alreadyExisted: true, error: 'already exists' })
    setupWithAdminDb()

    const result = await setModuleEnabled('tasks', 'user-1', true)
    expect(result.success).toBe(true)
    expect(result.warning).toMatch(/already exists/)
  })

  it('returns error when DB upsert throws', async () => {
    const mod = makeModule({ id: 'tasks' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })
    mockWithAdminDbFn.mockImplementationOnce(() => { throw new Error('DB connection lost') })

    const result = await setModuleEnabled('tasks', 'user-1', true)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/DB connection lost/)
  })

  it('persists schema hash after successful enable', async () => {
    const mod = makeModule({ id: 'tasks', schemaSha256: 'hash-abc' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })
    setupWithAdminDb()

    await setModuleEnabled('tasks', 'user-1', true)
    // persistSchemaInstalled eventually calls withAdminDb → db.update
    expect(mockUpdate).toHaveBeenCalled()
  })
})

// ── getEnabledModules ─────────────────────────────────────────────────────────

describe('getEnabledModules', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when no session and no userId provided', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await getEnabledModules()
    expect(result).toEqual([])
  })

  it('returns empty array when session has no user', async () => {
    mockGetSession.mockResolvedValue({ user: null })
    const result = await getEnabledModules()
    expect(result).toEqual([])
  })

  it('uses provided userId without calling getSession', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    // Return settings row with tasks enabled
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: {} }
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModules('user-1')
    expect(mockGetSession).not.toHaveBeenCalled()
    expect(Array.isArray(result)).toBe(true)
  })

  it('fetches userId from session when not provided', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'session-user-id' } })
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: {} }
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModules()
    expect(mockGetSession).toHaveBeenCalledTimes(1)
    expect(Array.isArray(result)).toBe(true)
  })

  it('filters out overridden modules from enabled list', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, isOverridden: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: {} }
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModules('user-1')
    expect(result.find(m => m.id === 'tasks')).toBeUndefined()
  })

  it('bootstraps modules missing from settings and re-reads', async () => {
    const mod = makeModule({ id: 'new-module', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    let callCount = 0
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      callCount++
      const rows = callCount === 1
        ? []  // first select: no settings (triggers bootstrap)
        : [{ moduleId: 'new-module', enabled: true, settings: {} }]  // refreshed

      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(rows),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModules('user-1')
    expect(Array.isArray(result)).toBe(true)
  })

  it('runs schema install for modules with outdated hash', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'new-hash' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: { __schema_installed_hash: 'old-hash' } }
          ]),
        }),
      }
      return fn(db)
    })

    await getEnabledModules('user-1')
    expect(mockRunModuleSchemaInstall).toHaveBeenCalledWith('tasks')
  })

  it('applies custom menuPriority from user settings', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, menuPriority: 5 })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: { menuPriority: 99 } }
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModules('user-1')
    const tasksModule = result.find(m => m.id === 'tasks')
    expect(tasksModule?.menuPriority).toBe(99)
  })

  it('returns module with original menuPriority when no custom priority set', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, menuPriority: 5 })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: {} }  // no menuPriority
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModules('user-1')
    const tasksModule = result.find(m => m.id === 'tasks')
    expect(tasksModule?.menuPriority).toBe(5)
  })

  it('buildSettingsMaps: settings with null enabled defaults to false', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: null, settings: {} }  // null enabled
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModules('user-1')
    // enabled=null → defaults to false → module NOT in results
    expect(result.find(m => m.id === 'tasks')).toBeUndefined()
  })

  it('buildSettingsMaps: settings with non-object settings field is skipped', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: 'not-an-object' }  // string
          ]),
        }),
      }
      return fn(db)
    })

    // Should not throw
    const result = await getEnabledModules('user-1')
    expect(Array.isArray(result)).toBe(true)
  })
})

// ── getEnabledModule ──────────────────────────────────────────────────────────

describe('getEnabledModule', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when no session and no userId provided', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await getEnabledModule('tasks')
    expect(result).toBeNull()
  })

  it('returns null when module does not exist', async () => {
    mockLoadModules.mockResolvedValue({ modules: [], errors: [] })
    const result = await getEnabledModule('nonexistent', 'user-1')
    expect(result).toBeNull()
  })

  it('returns null when module is disabled in settings', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { enabled: false, settings: {} }
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModule('tasks', 'user-1')
    expect(result).toBeNull()
  })

  it('returns module when enabled in settings and hash is up to date', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'abc' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { enabled: true, settings: { __schema_installed_hash: 'abc' } }
          ]),
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModule('tasks', 'user-1')
    expect(result).toEqual(mod)
    expect(mockRunModuleSchemaInstall).not.toHaveBeenCalled()
  })

  it('runs schema install when hash is outdated', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'new-hash' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { enabled: true, settings: { __schema_installed_hash: 'old-hash' } }
          ]),
        }),
      }
      return fn(db)
    })

    await getEnabledModule('tasks', 'user-1')
    expect(mockRunModuleSchemaInstall).toHaveBeenCalledWith('tasks')
  })

  it('seeds missing setting row for core module (defaultEnabled=true)', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, path: 'modules-core/tasks' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),  // no existing setting
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModule('tasks', 'user-1')
    // Core module defaults to enabled=true → returns the module
    expect(result).toEqual(mod)
  })

  it('seeds missing setting row for custom module (defaultEnabled=false)', async () => {
    const mod = makeModule({ id: 'my-custom', enabled: true, path: 'modules-custom/my-custom' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),  // no setting
        }),
      }
      return fn(db)
    })

    const result = await getEnabledModule('my-custom', 'user-1')
    // Custom modules default to disabled → returns null
    expect(result).toBeNull()
  })

  it('handles bootstrap error gracefully when no setting exists', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    let callCount = 0
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      callCount++
      if (callCount === 1) {
        // First call (select): returns no settings
        const db = {
          insert: vi.fn().mockReturnValue(makeInsertChain()),
          update: vi.fn().mockReturnValue(makeUpdateChain()),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
        }
        return fn(db)
      }
      // Second call (insert inside bootstrap): throw
      throw new Error('DB insert failed')
    })

    // Should not throw — error is caught
    const result = await getEnabledModule('tasks', 'user-1')
    // defaultEnabled=true for core module, returns mod even after bootstrap error
    expect(result).toEqual(mod)
  })

  it('runs schema install when seeding an enabled module with a hash', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'hash-xyz', path: 'modules-core/tasks' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),  // no setting
        }),
      }
      return fn(db)
    })

    await getEnabledModule('tasks', 'user-1')
    expect(mockRunModuleSchemaInstall).toHaveBeenCalledWith('tasks')
  })

  it('returns null from session when session.user is null', async () => {
    mockGetSession.mockResolvedValue({ user: null })
    const result = await getEnabledModule('tasks')
    expect(result).toBeNull()
  })
})

// ── warnIfMisconfiguredSchema (via getEnabledModules) ─────────────────────────

describe('warnIfMisconfiguredSchema — module with tables but no schemaSha256', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emits a console.warn for a misconfigured module (tables but no schemaSha256)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mod = makeModule({
      id: 'misconfigured-module',
      enabled: true,
      database: { tables: ['some_table'] },
      schemaSha256: undefined,  // no hash — misconfigured
    })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'misconfigured-module', enabled: true, settings: {} }
          ]),
        }),
      }
      return fn(db)
    })

    await getEnabledModules('user-warn')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ── installAndMark — failure backoff ─────────────────────────────────────────

describe('installAndMark — schema install failure and retry backoff', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not retry a recently-failed install with same hash', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'failing-hash' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    // First install fails
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: false, error: 'SQL error' })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'tasks', enabled: true, settings: { __schema_installed_hash: 'old-hash' } }
          ]),
        }),
      }
      return fn(db)
    })

    // First call: fails and stores failure
    await getEnabledModules('user-retry')
    const firstCallCount = mockRunModuleSchemaInstall.mock.calls.length

    // Second call within backoff window: should NOT retry
    await getEnabledModules('user-retry')
    // The install should not have been called again (backoff prevents retry)
    expect(mockRunModuleSchemaInstall.mock.calls.length).toBe(firstCallCount)
  })
})

// ── getEnabledModule — session userId (L351) ──────────────────────────────────

describe('getEnabledModule — session userId without explicit userId arg', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses userId from session when userId arg is not provided', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'session-uid' } })
    const mod = makeModule({ id: 'tasks', enabled: true })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { enabled: true, settings: {} }
          ]),
        }),
      }
      return fn(db)
    })

    // Call WITHOUT userId → falls through to session path → L344-351
    const result = await getEnabledModule('tasks')
    expect(result).toEqual(mod)
    expect(mockGetSession).toHaveBeenCalledTimes(1)
  })
})

// ── warnIfMisconfiguredSchema — already-warned deduplication (L50 B3B0) ───────

describe('warnIfMisconfiguredSchema — deduplication (already warned)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('only emits console.warn once per module even across multiple calls', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mod = makeModule({
      id: 'dup-warn-module',
      enabled: true,
      database: { tables: ['some_table'] },
      schemaSha256: undefined,
    })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { moduleId: 'dup-warn-module', enabled: true, settings: {} }
          ]),
        }),
      }
      return fn(db)
    })

    // First call: warns
    await getEnabledModules('user-dup-warn')
    const callCountAfterFirst = warnSpy.mock.calls.length

    // Second call with same module: should NOT warn again (deduplication)
    await getEnabledModules('user-dup-warn')
    // warnSpy call count should not have increased
    expect(warnSpy.mock.calls.length).toBe(callCountAfterFirst)
    warnSpy.mockRestore()
  })
})

// ── persistSchemaInstalled — catch block (L107) ───────────────────────────────

describe('persistSchemaInstalled — DB error in catch block', () => {
  beforeEach(() => vi.clearAllMocks())

  it('catches and logs error when DB update fails (non-fatal)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'new-hash' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    let callCount = 0
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      callCount++
      if (callCount === 1) {
        // First call: SELECT returning outdated hash
        const db = {
          insert: vi.fn().mockReturnValue(makeInsertChain()),
          update: vi.fn().mockReturnValue(makeUpdateChain()),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([
              { enabled: true, settings: { __schema_installed_hash: 'old-hash' } }
            ]),
          }),
        }
        return fn(db)
      }
      // Second+ call: UPDATE in persistSchemaInstalled throws
      throw new Error('DB update failed')
    })

    // Should not throw — catch block swallows the error
    const result = await getEnabledModule('tasks', 'user-persist-err')
    expect(result).toEqual(mod)
    // The catch block should have logged the error
    // console.error('[Modules] Failed to persist schema-install marker for %s:', moduleId, error)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist schema-install marker'),
      expect.any(String),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })
})

// ── installAndMark — in-flight deduplication (L153) ──────────────────────────

describe('installAndMark — concurrent calls share one in-flight Promise', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the existing in-flight promise when two installs race', async () => {
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'race-hash' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })

    let installResolve: () => void
    const installPromise = new Promise<void>((resolve) => { installResolve = resolve })
    mockRunModuleSchemaInstall.mockReturnValue(installPromise.then(() => ({ ok: true })))

    let callCount = 0
    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      callCount++
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { enabled: true, settings: { __schema_installed_hash: 'old-hash' } }
          ]),
        }),
      }
      return fn(db)
    })

    // Start two concurrent installs — second should re-use in-flight
    const p1 = getEnabledModule('tasks', 'user-race-1')
    const p2 = getEnabledModule('tasks', 'user-race-2')

    // Resolve the install
    installResolve!()
    await Promise.all([p1, p2])

    // Install should only have been called once (deduped)
    expect(mockRunModuleSchemaInstall).toHaveBeenCalledTimes(1)
  })
})

// ── isSchemaUpToDate — missing settings (L71) ────────────────────────────────

describe('isSchemaUpToDate — branches via getEnabledModule', () => {
  beforeEach(() => vi.clearAllMocks())

  it('treats schema as outdated when settings is null but expectedHash is set', async () => {
    // module.schemaSha256 = 'some-hash', settings = null
    // → !expectedHash is false → !settings is true → returns false (outdated)
    // → installAndMark is called
    const mod = makeModule({ id: 'tasks', enabled: true, schemaSha256: 'some-hash' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          // settings is null → isSchemaUpToDate(null, 'some-hash') → return false → needs install
          where: vi.fn().mockResolvedValue([{ enabled: true, settings: null }]),
        }),
      }
      return fn(db)
    })

    await getEnabledModule('tasks', 'user-nullsettings')
    expect(mockRunModuleSchemaInstall).toHaveBeenCalledWith('tasks')
  })
})

// ── getEnabledModule seed — module.enabled=undefined fallback (L379 B36B1) ────

describe('getEnabledModule seed — module.enabled undefined falls back to true', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to enabled=true for core module with undefined enabled field', async () => {
    // module.enabled is undefined → isCustom ? false : (undefined ?? true) → true
    // This exercises the ?? true fallback in the ternary on L379
    const mod = makeModule({ id: 'tasks', enabled: undefined as any, path: 'modules-core/tasks' })
    mockLoadModules.mockResolvedValue({ modules: [mod], errors: [] })
    mockRunModuleSchemaInstall.mockResolvedValue({ ok: true })

    mockWithAdminDbFn.mockImplementation((fn: (db: any) => any) => {
      const db = {
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),  // no existing setting → seed path
        }),
      }
      return fn(db)
    })

    // Core module with undefined enabled → defaults to true → module returned
    const result = await getEnabledModule('tasks', 'user-undef-enabled')
    expect(result).toEqual(mod)
  })
})
