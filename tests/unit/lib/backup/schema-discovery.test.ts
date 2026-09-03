import { describe, it, expect } from 'vitest'
import { discoverSchema, fetchTableRows, type QueryFn, type TableDefinition } from '@/lib/backup/schema-discovery'

const TABLE_ROWS = [
  { table_name: 'activity_log' }, // excluded
  { table_name: 'documents' },
  { table_name: 'tasks' },
  { table_name: 'user' },
]

const COLUMN_ROWS = [
  { table_name: 'tasks', name: 'id', data_type: 'uuid', not_null: true, identity: '', default_expr: 'gen_random_uuid()' },
  { table_name: 'tasks', name: 'assignees', data_type: 'text[]', not_null: false, identity: '', default_expr: "'{}'::text[]" },
  { table_name: 'user', name: 'id', data_type: 'text', not_null: true, identity: '', default_expr: null },
  { table_name: 'user', name: 'createdAt', data_type: 'timestamp with time zone', not_null: true, identity: '', default_expr: 'now()' },
  { table_name: 'documents', name: 'id', data_type: 'uuid', not_null: true, identity: '', default_expr: 'gen_random_uuid()' },
  { table_name: 'documents', name: 'user_id', data_type: 'text', not_null: true, identity: '', default_expr: null },
  { table_name: 'documents', name: 'seq', data_type: 'integer', not_null: true, identity: 'a', default_expr: null },
  { table_name: 'not_in_set', name: 'x', data_type: 'text', not_null: false, identity: '', default_expr: null },
]

const CONSTRAINT_ROWS = [
  { table_name: 'tasks', name: 'tasks_pkey', type: 'p', definition: 'PRIMARY KEY (id)', referenced_table: null, pk_columns: ['id'] },
  { table_name: 'user', name: 'user_pkey', type: 'p', definition: 'PRIMARY KEY (id)', referenced_table: null, pk_columns: ['id'] },
  { table_name: 'user', name: 'user_email_key', type: 'u', definition: 'UNIQUE (email)', referenced_table: null, pk_columns: null },
  { table_name: 'documents', name: 'documents_pkey', type: 'p', definition: 'PRIMARY KEY (id, user_id)', referenced_table: null, pk_columns: ['id', 'user_id'] },
  { table_name: 'documents', name: 'documents_user_fk', type: 'f', definition: 'FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE', referenced_table: 'user', pk_columns: null },
  { table_name: 'documents', name: 'documents_len_check', type: 'c', definition: 'CHECK ((length(title) > 0))', referenced_table: null, pk_columns: null },
  { table_name: 'not_in_set', name: 'x_pkey', type: 'p', definition: 'PRIMARY KEY (x)', referenced_table: null, pk_columns: ['x'] },
]

const INDEX_ROWS = [
  { table_name: 'tasks', name: 'idx_tasks_user_id', definition: 'CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id)' },
  { table_name: 'not_in_set', name: 'idx_nope', definition: 'CREATE INDEX idx_nope ON public.not_in_set USING btree (x)' },
]

function fixtureQuery(): QueryFn {
  // Dispatch on substrings unique to each catalog query (they share
  // pg_attribute/pg_constraint mentions in subselects).
  return (async (sql: string) => {
    if (sql.includes('information_schema.tables')) return TABLE_ROWS
    if (sql.includes('pg_attrdef')) return COLUMN_ROWS
    if (sql.includes('pg_get_constraintdef')) return CONSTRAINT_ROWS
    if (sql.includes('pg_indexes')) return INDEX_ROWS
    throw new Error(`Unexpected query: ${sql}`)
  }) as QueryFn
}

describe('discoverSchema', () => {
  it('assembles full table definitions, filtering excluded tables', async () => {
    const tables = await discoverSchema(fixtureQuery(), new Set(['activity_log']))
    expect(tables.map((t) => t.name)).toEqual(['documents', 'tasks', 'user'])

    const tasks = tables.find((t) => t.name === 'tasks')!
    expect(tasks.columns).toEqual([
      { name: 'id', dataType: 'uuid', notNull: true, defaultExpr: 'gen_random_uuid()', identity: '' },
      { name: 'assignees', dataType: 'text[]', notNull: false, defaultExpr: "'{}'::text[]", identity: '' },
    ])
    expect(tasks.primaryKey).toEqual(['id'])
    expect(tasks.indexes).toEqual([
      { name: 'idx_tasks_user_id', definition: 'CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id)' },
    ])
  })

  it('captures composite primary keys, FKs with referenced tables, and CHECKs', async () => {
    const tables = await discoverSchema(fixtureQuery(), new Set())
    const documents = tables.find((t) => t.name === 'documents')!
    expect(documents.primaryKey).toEqual(['id', 'user_id'])
    const fk = documents.constraints.find((c) => c.type === 'f')!
    expect(fk.referencedTable).toBe('user')
    expect(fk.definition).toContain('REFERENCES "user"(id)')
    expect(documents.constraints.some((c) => c.type === 'c')).toBe(true)
  })

  it('maps identity columns and camelCase names faithfully', async () => {
    const tables = await discoverSchema(fixtureQuery(), new Set())
    const documents = tables.find((t) => t.name === 'documents')!
    expect(documents.columns.find((c) => c.name === 'seq')?.identity).toBe('a')
    const user = tables.find((t) => t.name === 'user')!
    expect(user.columns.map((c) => c.name)).toContain('createdAt')
    expect(user.constraints.find((c) => c.type === 'u')?.name).toBe('user_email_key')
  })

  it('ignores catalog rows for tables outside the discovered set', async () => {
    const tables = await discoverSchema(fixtureQuery(), new Set(['activity_log']))
    expect(tables.some((t) => t.name === 'not_in_set')).toBe(false)
  })

  it('accepts pk_columns as a raw Postgres array literal (unparsed driver form)', async () => {
    const query = (async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [{ table_name: 'documents' }]
      if (sql.includes('pg_get_constraintdef'))
        return [
          { table_name: 'documents', name: 'documents_pkey', type: 'p', definition: 'PRIMARY KEY (id, user_id)', referenced_table: null, pk_columns: '{id,user_id}' },
        ]
      return []
    }) as QueryFn
    const tables = await discoverSchema(query, new Set())
    expect(tables[0].primaryKey).toEqual(['id', 'user_id'])
  })

  it('ignores an unrecognizable pk_columns value instead of crashing', async () => {
    const query = (async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [{ table_name: 'odd' }]
      if (sql.includes('pg_get_constraintdef'))
        return [
          { table_name: 'odd', name: 'odd_pkey', type: 'p', definition: 'PRIMARY KEY (id)', referenced_table: null, pk_columns: 'not-an-array' },
        ]
      return []
    }) as QueryFn
    const tables = await discoverSchema(query, new Set())
    expect(tables[0].primaryKey).toEqual([])
  })

  it('leaves primaryKey empty for tables without a PK constraint', async () => {
    const query = (async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [{ table_name: 'nopk' }]
      if (sql.includes('pg_attrdef'))
        return [{ table_name: 'nopk', name: 'x', data_type: 'text', not_null: false, identity: '', default_expr: null }]
      return []
    }) as QueryFn
    const tables = await discoverSchema(query, new Set())
    expect(tables[0].primaryKey).toEqual([])
    expect(tables[0].constraints).toEqual([])
  })

  it('propagates query failures', async () => {
    const query = (async () => {
      throw new Error('connection refused')
    }) as QueryFn
    await expect(discoverSchema(query, new Set())).rejects.toThrow('connection refused')
  })
})

describe('fetchTableRows', () => {
  const table = (name: string, primaryKey: string[]): TableDefinition => ({
    name,
    primaryKey,
    columns: [],
    constraints: [],
    indexes: [],
  })

  it('orders by the quoted primary key, composite and camelCase included', async () => {
    let captured = ''
    const query = (async (sql: string) => {
      captured = sql
      return [{ id: '1' }]
    }) as QueryFn
    const rows = await fetchTableRows(query, table('documents', ['id', 'user_id']))
    expect(captured).toBe('SELECT * FROM "documents" ORDER BY "id", "user_id"')
    expect(rows).toEqual([{ id: '1' }])

    await fetchTableRows(query, table('session', ['createdAt']))
    expect(captured).toBe('SELECT * FROM "session" ORDER BY "createdAt"')
  })

  it('omits ORDER BY when the table has no primary key', async () => {
    let captured = ''
    const query = (async (sql: string) => {
      captured = sql
      return []
    }) as QueryFn
    await fetchTableRows(query, table('nopk', []))
    expect(captured).toBe('SELECT * FROM "nopk"')
  })
})
