import { describe, it, expect } from 'vitest'
import { getExactRowCounts } from '@/lib/backup/row-counts'
import type { QueryFn } from '@/lib/backup/schema-discovery'

describe('getExactRowCounts', () => {
  it('returns exact counts per table', async () => {
    const query = (async (sql: string) => {
      if (sql.includes('"tasks"')) return [{ cnt: 42 }]
      if (sql.includes('"user"')) return [{ cnt: 3 }]
      return [{ cnt: 0 }]
    }) as QueryFn
    const result = await getExactRowCounts(query, ['tasks', 'user'])
    expect(result.counts).toEqual({ tasks: 42, user: 3 })
    expect(result.failures).toEqual({})
  })

  it('records failures per table instead of silently reporting 0', async () => {
    const query = (async (sql: string) => {
      if (sql.includes('"broken"')) throw new Error('relation does not exist')
      return [{ cnt: 1 }]
    }) as QueryFn
    const result = await getExactRowCounts(query, ['ok', 'broken'])
    expect(result.counts).toEqual({ ok: 1 })
    expect(result.failures).toEqual({ broken: 'relation does not exist' })
  })

  it('stringifies non-Error failures', async () => {
    const query = (async () => {
      throw 'string failure'
    }) as QueryFn
    const result = await getExactRowCounts(query, ['t'])
    expect(result.failures).toEqual({ t: 'string failure' })
  })

  it('rejects unsafe table names without querying', async () => {
    let queried = false
    const query = (async () => {
      queried = true
      return [{ cnt: 1 }]
    }) as QueryFn
    const result = await getExactRowCounts(query, ['bad"name; --'])
    expect(queried).toBe(false)
    expect(result.failures).toEqual({ 'bad"name; --': 'invalid table name' })
  })

  it('defaults a missing count row to 0 and handles empty input', async () => {
    const query = (async () => []) as QueryFn
    expect(await getExactRowCounts(query, ['t'])).toEqual({ counts: { t: 0 }, failures: {} })
    expect(await getExactRowCounts(query, [])).toEqual({ counts: {}, failures: {} })
  })
})
