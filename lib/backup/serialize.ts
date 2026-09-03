/**
 * SQL value + INSERT serialization for backup export.
 *
 * The load-bearing invariant: EVERY emitted statement is exactly one line
 * ending in `;`, with no raw newline or carriage return anywhere inside it.
 * String values are encoded as PostgreSQL `E'...'` escaped literals, so the
 * import-side parser (and any line-oriented tool) can never be confused by
 * user content — the round-trip suite in tests/unit/lib/backup enforces this.
 *
 * Pure logic — no database access.
 */

import { stripNul } from './format'

export class BackupSerializeError extends Error {}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Encode a JS string as a complete PostgreSQL `E'...'` literal.
 * Escapes, in order: backslash, single quote, newline, CR, tab; NUL is
 * stripped (Postgres cannot store it in text/jsonb). All other characters —
 * including all Unicode — pass through raw; Postgres does not treat
 * U+2028/U+2029 as line ends and neither does our parser.
 */
export function escapeStringLiteral(s: string): string {
  const escaped = stripNul(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `E'${escaped}'`
}

function serializeNumber(val: number): string {
  if (Number.isFinite(val)) return String(val)
  // Quoted, uncast: in INSERT ... VALUES the target column type coerces the
  // unknown-typed literal, which is correct for float8, real, AND numeric —
  // a hard ::float8 cast would be wrong for numeric columns.
  if (Number.isNaN(val)) return "'NaN'"
  return val > 0 ? "'Infinity'" : "'-Infinity'"
}

/**
 * Serialize one array value as a PostgreSQL `ARRAY[...]` constructor.
 * Reuses the single string escaper instead of the `'{...}'` literal form,
 * whose two nested escaping layers caused the historical apostrophe bug.
 */
export function serializeArray(arr: unknown[]): string {
  // Empty arrays have no elements to infer a type from; text[] is correct
  // for every array column in the schema today (all TEXT[]). A future
  // non-text array column would need schema-aware casting here.
  if (arr.length === 0) return 'ARRAY[]::text[]'
  const elements = arr.map((v) => {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    if (typeof v === 'number') return serializeNumber(v)
    if (typeof v === 'string') return escapeStringLiteral(v)
    // Nested arrays/objects cannot occur for TEXT[] columns — fail loudly
    // rather than emit a corrupt backup.
    throw new BackupSerializeError(`Unsupported array element type: ${typeof v}`)
  })
  return `ARRAY[${elements.join(',')}]`
}

/** Serialize one JS value (as returned by node-pg) into a SQL expression. */
export function serializeValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number') return serializeNumber(val)
  // Covers text columns and node-pg's string form of bigint/numeric —
  // quoted numerics assignment-coerce back into their columns.
  if (typeof val === 'string') return escapeStringLiteral(val)
  if (val instanceof Date) return escapeStringLiteral(val.toISOString())
  // bytea comes back as Buffer; emit Postgres hex-format input.
  if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'`
  if (Array.isArray(val)) return serializeArray(val)
  if (typeof val === 'object') {
    // json/jsonb: no explicit cast — the unknown-typed literal
    // assignment-coerces into BOTH json and jsonb columns, where a
    // hard ::jsonb cast would mis-cast json columns.
    return escapeStringLiteral(JSON.stringify(val))
  }
  // bigint (typeof 'bigint') and anything exotic: coerce via String.
  return escapeStringLiteral(String(val))
}

export interface InsertBatchOptions {
  /** Rows per INSERT statement (default 100). */
  batchSize?: number
  /** Flush a batch early once its serialized VALUES exceed this (default 512KB). */
  maxBatchBytes?: number
}

/**
 * Build multi-row INSERT statements for a table.
 *
 * - Every returned statement is exactly one line ending in `;`.
 * - Column set comes from the first row; a row with a different key set
 *   throws (export must fail loudly, never emit a corrupt file).
 * - Stateless per call: a paginated exporter can call it per page.
 */
export function buildInsertStatements(
  tableName: string,
  rows: Record<string, unknown>[],
  opts: InsertBatchOptions = {},
): string[] {
  const batchSize = opts.batchSize ?? 100
  const maxBatchBytes = opts.maxBatchBytes ?? 512 * 1024
  if (!IDENTIFIER_RE.test(tableName)) {
    throw new BackupSerializeError(`Invalid table name: ${tableName}`)
  }
  if (rows.length === 0) return []

  const columns = Object.keys(rows[0])
  for (const col of columns) {
    if (!IDENTIFIER_RE.test(col)) {
      throw new BackupSerializeError(`Invalid column name in ${tableName}: ${col}`)
    }
  }
  const expectedKeys = columns.slice().sort().join(',')
  const columnList = columns.map((c) => `"${c}"`).join(', ')

  const statements: string[] = []
  let batch: string[] = []
  let batchBytes = 0
  const flush = (): void => {
    if (batch.length > 0) {
      statements.push(`INSERT INTO "${tableName}" (${columnList}) VALUES ${batch.join(', ')};`)
      batch = []
      batchBytes = 0
    }
  }

  for (const row of rows) {
    if (Object.keys(row).slice().sort().join(',') !== expectedKeys) {
      throw new BackupSerializeError(`Row in ${tableName} has a different column set than the first row`)
    }
    const tuple = `(${columns.map((c) => serializeValue(row[c])).join(', ')})`
    if (batch.length >= batchSize || (batch.length > 0 && batchBytes + tuple.length > maxBatchBytes)) {
      flush()
    }
    batch.push(tuple)
    batchBytes += tuple.length
  }
  flush()
  return statements
}
