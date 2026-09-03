import { describe, it, expect } from 'vitest'
import { computeTableDiff, parseCreatedTables } from '@/lib/backup/expected-tables'

describe('parseCreatedTables', () => {
  it('parses quoted, unquoted, schema-qualified, and IF NOT EXISTS forms', () => {
    const sql = [
      'CREATE TABLE IF NOT EXISTS "tasks" (id TEXT);',
      'CREATE TABLE plain_table (id TEXT);',
      'CREATE TABLE IF NOT EXISTS public."user" (id TEXT);',
      'CREATE TABLE public.sessions (id TEXT);',
      'create table if not exists lower_case (id TEXT);',
    ].join('\n')
    expect(parseCreatedTables(sql).sort()).toEqual(['lower_case', 'plain_table', 'sessions', 'tasks', 'user'])
  })

  it('ignores CREATE TABLE mentions inside line comments', () => {
    const sql = [
      '-- CREATE TABLE commented_out (id TEXT);',
      'CREATE TABLE real_table (id TEXT); -- CREATE TABLE also_commented (x TEXT);',
    ].join('\n')
    expect(parseCreatedTables(sql)).toEqual(['real_table'])
  })

  it('deduplicates repeated definitions and handles empty input', () => {
    const sql = 'CREATE TABLE t (a TEXT);\nCREATE TABLE IF NOT EXISTS t (a TEXT);'
    expect(parseCreatedTables(sql)).toEqual(['t'])
    expect(parseCreatedTables('')).toEqual([])
    expect(parseCreatedTables('SELECT 1;')).toEqual([])
  })
})

describe('computeTableDiff', () => {
  const input = {
    live: ['tasks', 'user', 'fitness_days', 'mystery_table'],
    core: ['tasks', 'user', 'module_settings'],
    modules: {
      fitness: { tables: ['fitness_days'], enabled: true },
      chat: { tables: ['chat_threads'], enabled: true },
      spy: { tables: ['spy_caches'], enabled: false },
    },
  }

  it('reports expected-but-absent tables as missing (core and enabled modules)', () => {
    const diff = computeTableDiff(input)
    expect(diff.missing).toEqual(['chat_threads', 'module_settings'])
  })

  it('reports only genuinely unknown tables as extra — disabled-module leftovers are not extra', () => {
    const diff = computeTableDiff({ ...input, live: [...input.live, 'spy_caches'] })
    expect(diff.extra).toEqual(['mystery_table'])
  })

  it('counts expected tables as core plus enabled modules only when no leftovers exist', () => {
    const diff = computeTableDiff(input)
    // tasks, user, module_settings, fitness_days, chat_threads
    expect(diff.expectedCount).toBe(5)
  })

  it('counts present disabled-module leftovers in the denominator so found/expected agrees', () => {
    const live = ['tasks', 'user', 'module_settings', 'fitness_days', 'chat_threads', 'spy_caches']
    const diff = computeTableDiff({ ...input, live })
    // The 5 expected plus the live-but-disabled spy_caches — matches tablesFound
    expect(diff.expectedCount).toBe(6)
    expect(diff.expectedCount).toBe(live.length)
    expect(diff.missing).toEqual([])
    expect(diff.extra).toEqual([])
    // An ABSENT disabled-module table is neither missing nor expected
    const without = computeTableDiff({ ...input, live: live.filter((t) => t !== 'spy_caches') })
    expect(without.expectedCount).toBe(5)
    expect(without.missing).toEqual([])
  })

  it('reports a clean bill when live matches expectations', () => {
    const diff = computeTableDiff({
      live: ['a', 'b'],
      core: ['a'],
      modules: { m: { tables: ['b'], enabled: true } },
    })
    expect(diff).toEqual({ missing: [], extra: [], expectedCount: 2 })
  })
})
