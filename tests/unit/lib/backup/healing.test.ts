import { describe, it, expect, vi } from 'vitest'
import { buildModuleHashInvalidationSql, runPostRestoreHealing } from '@/lib/backup/healing'

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
    expect(sql).toContain("settings - '__schema_installed_hash'")
    expect(sql).toContain("WHERE settings ? '__schema_installed_hash'")
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
