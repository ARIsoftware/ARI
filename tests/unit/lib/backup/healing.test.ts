import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildModuleHashInvalidationSql, runPostRestoreHealing } from '@/lib/backup/healing'
import { SCHEMA_INSTALLED_HASH_KEY } from '@/lib/modules/schema-hash-key'

describe('buildModuleHashInvalidationSql', () => {
  it('produces the exact self-guarding, single-line invalidation statement', () => {
    const sql = buildModuleHashInvalidationSql()
    expect(sql).toBe(
      "DO $$ BEGIN IF to_regclass('public.module_settings') IS NOT NULL THEN " +
        "UPDATE module_settings SET settings = settings - '__schema_installed_hash' " +
        "WHERE settings ? '__schema_installed_hash'; END IF; END $$"
    )
    expect(sql.includes('\n')).toBe(false)
  })

  it('guards against backups predating module_settings and touches only rows carrying the hash', () => {
    const sql = buildModuleHashInvalidationSql()
    expect(sql).toContain("to_regclass('public.module_settings') IS NOT NULL")
    expect(sql).toContain(`settings - '${SCHEMA_INSTALLED_HASH_KEY}'`)
    expect(sql).toContain(`WHERE settings ? '${SCHEMA_INSTALLED_HASH_KEY}'`)
  })

  it('shares the exact key the module-registry gate compares, and setup.sql uses the same literal', () => {
    // Restore correctness of every module's RLS/policies depends on this
    // string equality — the SQL is built FROM the shared constant, and the
    // idempotent copy in setup.sql must keep matching it.
    expect(SCHEMA_INSTALLED_HASH_KEY).toBe('__schema_installed_hash')
    expect(buildModuleHashInvalidationSql()).toContain(SCHEMA_INSTALLED_HASH_KEY)
    const setupSql = readFileSync(join(process.cwd(), 'lib/db/setup.sql'), 'utf8')
    expect(setupSql).toContain(`'${SCHEMA_INSTALLED_HASH_KEY}'`)
  })
})

describe('runPostRestoreHealing', () => {
  it('reports a successful core reapply', async () => {
    const reapply = vi.fn().mockResolvedValue(true)
    await expect(runPostRestoreHealing(reapply)).resolves.toEqual({ coreSchemaReapplied: true })
    expect(reapply).toHaveBeenCalledTimes(1)
  })

  it('reports a declined reapply', async () => {
    await expect(runPostRestoreHealing(async () => false)).resolves.toEqual({ coreSchemaReapplied: false })
  })

  it('never throws, even when reapply rejects', async () => {
    const reapply = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(runPostRestoreHealing(reapply)).resolves.toEqual({ coreSchemaReapplied: false })
  })
})
