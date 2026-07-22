/**
 * Tests for lib/modules/schema-installer.ts — raising from ~18% to ~100%.
 *
 * The existing schema-scan.test.ts covers scanForForbiddenSql fully.
 * This file covers:
 *  - runSchemaSqlAtPath: ENOENT → ok, read error → error, forbidden SQL → error, DB error → error, happy path
 *  - runModuleSchemaInstall: module not in map → ok, forbidden → error, DB happy path
 *  - executeSchemaSql (tested indirectly): BEGIN/COMMIT, ROLLBACK on error, release
 *
 * Mocks: fs/promises (readFile), @/lib/db (getPoolClient), @/lib/generated/module-schemas
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── module-schemas mock ──────────────────────────────────────────────────────
// Must be before importing the SUT so the mock is in place.
vi.mock('@/lib/generated/module-schemas', () => ({
  MODULE_SCHEMAS: {
    'known-module': 'CREATE TABLE IF NOT EXISTS known_table (id TEXT PRIMARY KEY);',
    'forbidden-module': 'DROP TABLE bad_table;',
    'already-exists-module': 'CREATE TABLE existing_table (id TEXT);',
  },
}))

// ── fs/promises mock ──────────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

// ── db mock ───────────────────────────────────────────────────────────────────
// getPoolClient returns a fake client object with query, release methods.
const mockQuery = vi.fn()
const mockRelease = vi.fn()
const mockClient = { query: mockQuery, release: mockRelease }

vi.mock('@/lib/db', () => ({
  getPoolClient: vi.fn(),
}))

// ── import SUT + mocked helpers ───────────────────────────────────────────────
import { runSchemaSqlAtPath, runModuleSchemaInstall, scanForForbiddenSql } from '@/lib/modules/schema-installer'
import { readFile } from 'fs/promises'
import { getPoolClient } from '@/lib/db'

const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>
const mockGetPoolClient = getPoolClient as unknown as ReturnType<typeof vi.fn>

// ── helpers ───────────────────────────────────────────────────────────────────

function setupDb(options: { queryError?: Error; queryAlreadyExists?: boolean } = {}) {
  mockGetPoolClient.mockResolvedValue(mockClient)
  mockRelease.mockReturnValue(undefined)

  if (options.queryError) {
    const err = options.queryAlreadyExists
      ? Object.assign(new Error('relation "t" already exists'), { message: 'relation "t" already exists' })
      : options.queryError
    mockQuery.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve()
      throw err
    })
  } else {
    mockQuery.mockResolvedValue({})
  }
}

// ── scanForForbiddenSql — extended patterns ────────────────────────────────────

describe('scanForForbiddenSql — DROP DATABASE', () => {
  it('detects DROP DATABASE', () => {
    expect(scanForForbiddenSql('DROP DATABASE mydb;')).toBe('DROP DATABASE')
  })
})

// ── runSchemaSqlAtPath ────────────────────────────────────────────────────────

describe('runSchemaSqlAtPath — ENOENT', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok:true when schema file does not exist (ENOENT)', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFile.mockRejectedValueOnce(err)

    const result = await runSchemaSqlAtPath('my-module', '/modules/my-module/database/schema.sql')
    expect(result).toMatchObject({ ok: true })
  })
})

describe('runSchemaSqlAtPath — non-ENOENT read error', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when file exists but cannot be read', async () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    mockReadFile.mockRejectedValueOnce(err)

    const result = await runSchemaSqlAtPath('my-module', '/path/schema.sql')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Failed to read/)
  })
})

describe('runSchemaSqlAtPath — forbidden SQL', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses to run SQL containing DROP TABLE', async () => {
    mockReadFile.mockResolvedValueOnce('DROP TABLE t;')

    const result = await runSchemaSqlAtPath('my-module', '/schema.sql')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/refused/)
  })
})

describe('runSchemaSqlAtPath — db connection failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when pool client cannot be acquired', async () => {
    mockReadFile.mockResolvedValueOnce('CREATE TABLE IF NOT EXISTS t (id TEXT);')
    mockGetPoolClient.mockRejectedValueOnce(new Error('pool exhausted'))

    const result = await runSchemaSqlAtPath('my-module', '/schema.sql')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Failed to acquire DB connection/)
  })
})

describe('runSchemaSqlAtPath — happy path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok:true after successful transaction', async () => {
    mockReadFile.mockResolvedValueOnce('CREATE TABLE IF NOT EXISTS t (id TEXT);')
    setupDb()

    const result = await runSchemaSqlAtPath('my-module', '/schema.sql')
    expect(result).toMatchObject({ ok: true })
    // Should call BEGIN, then the SQL, then COMMIT
    expect(mockQuery).toHaveBeenCalledWith('BEGIN')
    expect(mockQuery).toHaveBeenCalledWith('COMMIT')
    expect(mockRelease).toHaveBeenCalled()
  })
})

describe('runSchemaSqlAtPath — query failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rolls back and returns error when SQL execution fails', async () => {
    mockReadFile.mockResolvedValueOnce('CREATE TABLE t (id TEXT);')
    mockGetPoolClient.mockResolvedValue(mockClient)
    mockRelease.mockReturnValue(undefined)

    // BEGIN succeeds, actual SQL fails, ROLLBACK succeeds
    let callCount = 0
    mockQuery.mockImplementation((sql: string) => {
      callCount++
      if (sql === 'BEGIN') return Promise.resolve()
      if (sql === 'ROLLBACK') return Promise.resolve()
      throw new Error('syntax error near "TABLE"')
    })

    const result = await runSchemaSqlAtPath('my-module', '/schema.sql')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/syntax error/)
      expect(result.alreadyExisted).toBe(false)
    }
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mockRelease).toHaveBeenCalled()
  })

  it('sets alreadyExisted=true when error contains "already exists"', async () => {
    mockReadFile.mockResolvedValueOnce('CREATE TABLE t (id TEXT);')
    mockGetPoolClient.mockResolvedValue(mockClient)
    mockRelease.mockReturnValue(undefined)

    let callCount = 0
    mockQuery.mockImplementation((sql: string) => {
      callCount++
      if (sql === 'BEGIN') return Promise.resolve()
      if (sql === 'ROLLBACK') return Promise.resolve()
      throw new Error('table "t" already exists')
    })

    const result = await runSchemaSqlAtPath('my-module', '/schema.sql')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.alreadyExisted).toBe(true)
    }
  })

  it('handles ROLLBACK failure gracefully (still returns original error)', async () => {
    mockReadFile.mockResolvedValueOnce('CREATE TABLE t (id TEXT);')
    mockGetPoolClient.mockResolvedValue(mockClient)
    mockRelease.mockReturnValue(undefined)

    mockQuery.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve()
      if (sql === 'ROLLBACK') throw new Error('rollback also failed')
      throw new Error('original error')
    })

    // Should not throw even if ROLLBACK fails
    const result = await runSchemaSqlAtPath('my-module', '/schema.sql')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/original error/)
  })

  it('handles release() throwing gracefully', async () => {
    mockReadFile.mockResolvedValueOnce('CREATE TABLE IF NOT EXISTS t (id TEXT);')
    mockGetPoolClient.mockResolvedValue(mockClient)
    mockQuery.mockResolvedValue({})
    mockRelease.mockImplementation(() => { throw new Error('release failed') })

    // Should not throw
    const result = await runSchemaSqlAtPath('my-module', '/schema.sql')
    expect(result).toMatchObject({ ok: true })
  })
})

// ── runModuleSchemaInstall ────────────────────────────────────────────────────

describe('runModuleSchemaInstall — module not in map', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok:true for a module with no bundled schema', async () => {
    const result = await runModuleSchemaInstall('unknown-module')
    expect(result).toMatchObject({ ok: true })
    // No db call needed
    expect(mockGetPoolClient).not.toHaveBeenCalled()
  })
})

describe('runModuleSchemaInstall — known module, happy path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('executes bundled SQL for a known module', async () => {
    setupDb()
    const result = await runModuleSchemaInstall('known-module')
    expect(result).toMatchObject({ ok: true })
    expect(mockQuery).toHaveBeenCalledWith('BEGIN')
    expect(mockQuery).toHaveBeenCalledWith('COMMIT')
  })
})

describe('runModuleSchemaInstall — forbidden bundled SQL', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses to run bundled SQL containing forbidden statements', async () => {
    const result = await runModuleSchemaInstall('forbidden-module')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/refused/)
    // Should NOT have opened a DB connection
    expect(mockGetPoolClient).not.toHaveBeenCalled()
  })
})

describe('runModuleSchemaInstall — already-exists module', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns alreadyExisted=true when table already exists error occurs', async () => {
    mockGetPoolClient.mockResolvedValue(mockClient)
    mockRelease.mockReturnValue(undefined)
    let callCount = 0
    mockQuery.mockImplementation((sql: string) => {
      callCount++
      if (sql === 'BEGIN') return Promise.resolve()
      if (sql === 'ROLLBACK') return Promise.resolve()
      throw new Error('relation "existing_table" already exists')
    })

    const result = await runModuleSchemaInstall('already-exists-module')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.alreadyExisted).toBe(true)
  })
})
