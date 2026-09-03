import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXCLUDED_TABLES, MAX_BACKUP_FILE_BYTES, MAX_BACKUP_FILE_LABEL } from '@/lib/backup/constants'

describe('backup constants', () => {
  it('caps import uploads at 200MB with a matching label', () => {
    expect(MAX_BACKUP_FILE_BYTES).toBe(200 * 1024 * 1024)
    expect(MAX_BACKUP_FILE_LABEL).toBe('200MB')
  })

  it('keeps EXCLUDED_TABLES in sync with get_all_user_tables() in setup.sql', () => {
    const setupSql = readFileSync(join(process.cwd(), 'lib/db/setup.sql'), 'utf8')

    // Locate the NOT IN (...) list inside get_all_user_tables().
    const fnStart = setupSql.indexOf('FUNCTION public.get_all_user_tables()')
    expect(fnStart).toBeGreaterThan(-1)
    const notInMatch = setupSql.slice(fnStart).match(/NOT IN \(([^)]+)\)/)
    expect(notInMatch).not.toBeNull()

    const sqlExclusions = [...notInMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(new Set(sqlExclusions)).toEqual(new Set(EXCLUDED_TABLES))
  })
})
