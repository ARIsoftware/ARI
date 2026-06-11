import { describe, it, expect } from 'vitest'
import { scanForForbiddenSql } from '@/lib/modules/schema-installer'

describe('scanForForbiddenSql — safe SQL', () => {
  it('returns null for a normal CREATE TABLE IF NOT EXISTS', () => {
    expect(scanForForbiddenSql('CREATE TABLE IF NOT EXISTS t (id uuid);')).toBeNull()
  })
})

describe('scanForForbiddenSql — forbidden patterns', () => {
  it('detects DROP TABLE', () => {
    expect(scanForForbiddenSql('DROP TABLE t;')).toBe('DROP TABLE')
  })

  it('detects TRUNCATE', () => {
    expect(scanForForbiddenSql('TRUNCATE t;')).toBe('TRUNCATE')
  })

  it('detects DROP SCHEMA', () => {
    expect(scanForForbiddenSql('DROP SCHEMA public;')).toBe('DROP SCHEMA')
  })

  it('detects ALTER TABLE ... DROP COLUMN', () => {
    expect(scanForForbiddenSql('ALTER TABLE t DROP COLUMN c;')).toBe('ALTER TABLE … DROP COLUMN')
  })

  it('detects DELETE without WHERE', () => {
    expect(scanForForbiddenSql("DELETE FROM t;")).toBe('DELETE without WHERE')
  })

  it('returns null for DELETE with WHERE clause', () => {
    expect(scanForForbiddenSql("DELETE FROM t WHERE id = '1';")).toBeNull()
  })
})

describe('scanForForbiddenSql — comment immunity', () => {
  it('ignores DROP TABLE inside a line comment', () => {
    expect(scanForForbiddenSql('-- DROP TABLE t')).toBeNull()
  })

  it('ignores DROP TABLE inside a block comment', () => {
    expect(scanForForbiddenSql('/* DROP TABLE t */')).toBeNull()
  })

  it('detects DELETE without WHERE even when comment is on same line', () => {
    // Comment is stripped but the real statement remains
    expect(scanForForbiddenSql('DELETE FROM t -- cleanup\n;')).toBe('DELETE without WHERE')
  })
})
