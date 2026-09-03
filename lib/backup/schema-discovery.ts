/**
 * Schema discovery for backup export, from pg_catalog (not information_schema
 * guessing). format_type() gives exact column types (text[], integer[],
 * character varying(50), numeric(10,4)); pg_get_expr() gives verbatim
 * defaults; pg_get_constraintdef() gives complete constraint definitions
 * including composite and self-referencing FKs.
 *
 * All queries are injected via QueryFn so this module stays pure and fully
 * unit-testable; the export route binds it to one client inside a
 * REPEATABLE READ snapshot so schema and data are mutually consistent.
 */

export type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

export interface ColumnDef {
  name: string
  /** Exact type from format_type(atttypid, atttypmod). */
  dataType: string
  notNull: boolean
  /** Verbatim default expression from pg_get_expr, or null. */
  defaultExpr: string | null
  /** pg_attribute.attidentity: '' none, 'a' ALWAYS, 'd' BY DEFAULT. */
  identity: '' | 'a' | 'd'
}

export interface ConstraintDef {
  name: string
  /** pg_constraint.contype: p=primary, u=unique, c=check, f=foreign key. */
  type: 'p' | 'u' | 'c' | 'f'
  /** Complete definition from pg_get_constraintdef(oid). */
  definition: string
  /** Referenced table name, FKs only. */
  referencedTable: string | null
}

export interface IndexDef {
  name: string
  /** Verbatim pg_indexes.indexdef (no trailing semicolon). */
  definition: string
}

export interface TableDefinition {
  name: string
  columns: ColumnDef[]
  /** PK column names in key order; empty when the table has no PK. */
  primaryKey: string[]
  constraints: ConstraintDef[]
  /** Non-constraint-backed indexes only (PK/UNIQUE indexes come with their constraints). */
  indexes: IndexDef[]
}

interface TableRow {
  table_name: string
}
interface ColumnRow {
  table_name: string
  name: string
  data_type: string
  not_null: boolean
  identity: string
  default_expr: string | null
}
interface ConstraintRow {
  table_name: string
  name: string
  type: string
  definition: string
  referenced_table: string | null
  pk_columns: string[] | string | null
}

/** Normalize a Postgres array that the driver may hand back either parsed
 *  (string[]) or raw ('{id,user_id}'), depending on the column's array type. */
function toColumnArray(value: string[] | string | null): string[] | null {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1)
    if (!inner) return []
    // Simple form is enough here: PK column names are identifiers (no commas
    // or embedded quotes beyond optional wrapping).
    return inner.split(',').map((s) => s.replace(/^"|"$/g, ''))
  }
  return null
}
interface IndexRow {
  table_name: string
  name: string
  definition: string
}

/** Discover every public-schema base table's full definition in 4 bulk queries. */
export async function discoverSchema(
  query: QueryFn,
  excluded: ReadonlySet<string>,
): Promise<TableDefinition[]> {
  const tableRows = await query<TableRow>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)
  const tables = tableRows.map((r) => r.table_name).filter((name) => name && !excluded.has(name))

  const [columnRows, constraintRows, indexRows] = await Promise.all([
    query<ColumnRow>(`
      SELECT c.relname AS table_name,
             a.attname AS name,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             a.attnotnull AS not_null,
             a.attidentity AS identity,
             pg_get_expr(d.adbin, d.adrelid) AS default_expr
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum
    `),
    query<ConstraintRow>(`
      SELECT c.relname AS table_name,
             con.conname AS name,
             con.contype AS type,
             pg_get_constraintdef(con.oid) AS definition,
             CASE WHEN con.contype = 'f'
               THEN (SELECT relname FROM pg_class WHERE oid = con.confrelid)
             END AS referenced_table,
             CASE WHEN con.contype = 'p' THEN (
               -- attname is type "name"; cast to text so the aggregate is
               -- text[], which node-pg parses into a JS array (it has no
               -- parser for name[] and would hand back the raw '{id}' string).
               SELECT array_agg(a.attname::text ORDER BY k.ord)
               FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ) END AS pk_columns
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND con.contype IN ('p','u','c','f')
      ORDER BY c.relname, con.conname
    `),
    query<IndexRow>(`
      SELECT i.tablename AS table_name,
             i.indexname AS name,
             i.indexdef AS definition
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.indexname NOT IN (
          SELECT c2.relname
          FROM pg_constraint con
          JOIN pg_class c2 ON c2.oid = con.conindid
          WHERE con.conindid <> 0
        )
      ORDER BY i.tablename, i.indexname
    `),
  ])

  const byTable = new Map<string, TableDefinition>(
    tables.map((name) => [name, { name, columns: [], primaryKey: [], constraints: [], indexes: [] }]),
  )

  for (const row of columnRows) {
    const table = byTable.get(row.table_name)
    if (!table) continue
    table.columns.push({
      name: row.name,
      dataType: row.data_type,
      notNull: row.not_null,
      defaultExpr: row.default_expr,
      identity: row.identity === 'a' || row.identity === 'd' ? row.identity : '',
    })
  }

  for (const row of constraintRows) {
    const table = byTable.get(row.table_name)
    if (!table) continue
    const type = row.type as ConstraintDef['type']
    table.constraints.push({
      name: row.name,
      type,
      definition: row.definition,
      // Verbatim referenced table for FKs; ddl.ts decides whether it is in
      // the backup set (emit) or not (skip + report).
      referencedTable: type === 'f' ? (row.referenced_table ?? null) : null,
    })
    if (type === 'p') {
      const pkColumns = toColumnArray(row.pk_columns)
      if (pkColumns) table.primaryKey = pkColumns
    }
  }

  for (const row of indexRows) {
    const table = byTable.get(row.table_name)
    if (!table) continue
    table.indexes.push({ name: row.name, definition: row.definition })
  }

  return tables.map((name) => byTable.get(name)!)
}

/**
 * Fetch every row of a table in one deterministic query, ordered by its real
 * (quoted) primary key. Runs inside the export route's REPEATABLE READ
 * snapshot, so there is no pagination and no concurrency hazard — this
 * replaces the OFFSET paging whose unordered fallback could skip or
 * duplicate rows on camelCase tables.
 */
export async function fetchTableRows(
  query: QueryFn,
  table: TableDefinition,
): Promise<Record<string, unknown>[]> {
  const orderBy = table.primaryKey.length
    ? ` ORDER BY ${table.primaryKey.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')}`
    : ''
  return query(`SELECT * FROM "${table.name}"${orderBy}`)
}
