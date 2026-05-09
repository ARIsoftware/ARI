import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { isProductionSafeOperation } from '@/lib/admin-helpers'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'
import { queryRows, EXCLUDED_TABLES, calculateChecksum, stripNul } from '../utils'

type ColumnInfo = {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  character_maximum_length: number | null
  ordinal_position?: number
}

export const debugRole = "backup-export"

async function discoverTables(): Promise<{ tables: string[], method: string, warnings: string[] }> {
  const warnings: string[] = []

  try {
    logger.info('Starting table discovery via direct SQL...')

    const result = await queryRows<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    const tables = result
      .map(row => row.table_name)
      .filter(name => name && !EXCLUDED_TABLES.has(name))

    logger.info(`✅ Found ${tables.length} tables via direct SQL`)
    return { tables, method: 'direct_sql', warnings }

  } catch (error: unknown) {
    logger.error('Critical error in table discovery:', error)
    warnings.push(`Critical error during discovery: ${error instanceof Error ? error.message : String(error)}`)
    return { tables: [], method: 'error', warnings }
  }
}

// Validate table name against whitelist to prevent SQL injection
function isValidTableName(tableName: string, validTables: string[]): boolean {
  return validTables.includes(tableName) && /^[a-z_][a-z0-9_]*$/i.test(tableName)
}

// Discover all table schemas upfront in a single query
async function discoverAllSchemas(tables: string[]): Promise<Record<string, ColumnInfo[]>> {
  const allSchemas: Record<string, ColumnInfo[]> = {}

  // Initialize empty arrays for all tables
  for (const table of tables) {
    allSchemas[table] = []
  }

  try {
    logger.info('Discovering all table schemas via information_schema...')

    const columns = await queryRows<{
      table_name: string
      column_name: string
      data_type: string
      is_nullable: string
      column_default: string | null
      character_maximum_length: number | null
      ordinal_position: number
    }>(`
      SELECT table_name, column_name, data_type, is_nullable,
             column_default, character_maximum_length, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `)

    for (const row of columns) {
      if (tables.includes(row.table_name)) {
        if (!allSchemas[row.table_name]) {
          allSchemas[row.table_name] = []
        }
        allSchemas[row.table_name].push({
          column_name: row.column_name,
          data_type: row.data_type,
          is_nullable: row.is_nullable,
          column_default: row.column_default,
          character_maximum_length: row.character_maximum_length,
          ordinal_position: row.ordinal_position
        })
      }
    }

    const tablesWithSchema = Object.entries(allSchemas).filter(([_, cols]) => cols.length > 0).length
    logger.info(`Schema discovery complete: ${tablesWithSchema}/${tables.length} tables have schema`)
    return allSchemas

  } catch (error: unknown) {
    logger.error('Critical error in schema discovery:', error)
    return allSchemas
  }
}

// Get schema for a single table (uses cached schemas or falls back to sample row)
function getTableSchemaFromCache(
  tableName: string,
  cachedSchemas: Record<string, ColumnInfo[]>,
  sampleData: Record<string, unknown>[] | null
): ColumnInfo[] {
  // First check cached schemas from bulk discovery
  if (cachedSchemas[tableName] && cachedSchemas[tableName].length > 0) {
    return cachedSchemas[tableName]
  }

  // Fallback: infer from sample data if available
  if (sampleData && sampleData.length > 0) {
    const sample = sampleData[0]
    const schema = Object.entries(sample).map(([columnName, value], index) => {
      let dataType = 'text'

      if (value === null) {
        dataType = 'text'
      } else if (typeof value === 'boolean') {
        dataType = 'boolean'
      } else if (typeof value === 'number') {
        dataType = Number.isInteger(value) ? 'integer' : 'numeric'
      } else if (typeof value === 'string') {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
          dataType = 'uuid'
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
          dataType = 'timestamp with time zone'
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          dataType = 'date'
        } else {
          dataType = 'text'
        }
      } else if (Array.isArray(value)) {
        dataType = 'array'
      } else if (typeof value === 'object') {
        dataType = 'jsonb'
      }

      return {
        column_name: columnName,
        data_type: dataType,
        is_nullable: 'YES',
        column_default: columnName === 'id' ? 'gen_random_uuid()' :
          (columnName.includes('created_at') || columnName.includes('updated_at') ? 'now()' : null),
        character_maximum_length: null,
        ordinal_position: index + 1
      }
    })

    logger.info(`Inferred schema for ${tableName} from sample data: ${schema.length} columns`)
    return schema
  }

  // No schema available
  return []
}

// Discover all table constraints in two bulk queries (avoids N+1)
async function discoverAllConstraints(tables: string[]): Promise<Record<string, { primaryKeys: string[], uniqueKeys: { name: string, columns: string[] }[], foreignKeys: never[] }>> {
  const result: Record<string, { primaryKeys: string[], uniqueKeys: { name: string, columns: string[] }[], foreignKeys: never[] }> = {}
  for (const t of tables) {
    result[t] = { primaryKeys: ['id'], uniqueKeys: [], foreignKeys: [] }
  }

  try {
    const allConstraints = await queryRows<{ table_name: string; constraint_name: string; constraint_type: string }>(`
      SELECT table_name, constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
    `)

    const allKeyColumns = await queryRows<{ table_name: string; column_name: string; constraint_name: string }>(`
      SELECT table_name, column_name, constraint_name
      FROM information_schema.key_column_usage
      WHERE table_schema = 'public'
    `)

    for (const table of tables) {
      const constraints = allConstraints.filter(c => c.table_name === table)
      const keyColumns = allKeyColumns.filter(k => k.table_name === table)

      if (constraints.length === 0) continue

      const primaryKeys = constraints
        .filter(c => c.constraint_type === 'PRIMARY KEY')
        .flatMap(c => keyColumns.filter(k => k.constraint_name === c.constraint_name).map(k => k.column_name))

      const uniqueKeys = constraints
        .filter(c => c.constraint_type === 'UNIQUE')
        .map(c => ({
          name: c.constraint_name,
          columns: keyColumns.filter(k => k.constraint_name === c.constraint_name).map(k => k.column_name)
        }))

      result[table] = { primaryKeys: primaryKeys.length > 0 ? primaryKeys : ['id'], uniqueKeys, foreignKeys: [] }
    }
  } catch (error) {
    logger.warn('Could not discover constraints:', error)
  }

  return result
}

// Convert PostgreSQL data type to CREATE TABLE format
function mapDataType(dataType: string, isNullable: string, columnDefault: string | null, charMaxLength: number | null = null): string {
  let sqlType = dataType.toUpperCase()

  // Map common types
  switch (dataType.toLowerCase()) {
    case 'character varying':
      sqlType = charMaxLength ? `VARCHAR(${charMaxLength})` : 'TEXT'
      break
    case 'timestamp with time zone':
      sqlType = 'TIMESTAMPTZ'
      break
    case 'timestamp without time zone':
      sqlType = 'TIMESTAMP'
      break
    case 'boolean':
      sqlType = 'BOOLEAN'
      break
    case 'integer':
      sqlType = 'INTEGER'
      break
    case 'bigint':
      sqlType = 'BIGINT'
      break
    case 'smallint':
      sqlType = 'SMALLINT'
      break
    case 'numeric':
    case 'decimal':
      sqlType = 'NUMERIC'
      break
    case 'double precision':
      sqlType = 'DOUBLE PRECISION'
      break
    case 'real':
      sqlType = 'REAL'
      break
    case 'uuid':
      sqlType = 'UUID'
      break
    case 'date':
      sqlType = 'DATE'
      break
    case 'time':
    case 'time without time zone':
      sqlType = 'TIME'
      break
    case 'text':
      sqlType = 'TEXT'
      break
    case 'json':
      sqlType = 'JSON'
      break
    case 'jsonb':
      sqlType = 'JSONB'
      break
    case 'array':
    case 'ARRAY':
      sqlType = 'TEXT[]'
      break
  }

  // Add constraints
  if (isNullable === 'NO') {
    sqlType += ' NOT NULL'
  }

  // Add defaults
  if (columnDefault) {
    if (columnDefault.includes('gen_random_uuid()')) {
      sqlType += ' DEFAULT gen_random_uuid()'
    } else if (columnDefault.includes('now()') || columnDefault.includes('CURRENT_TIMESTAMP')) {
      sqlType += ' DEFAULT NOW()'
    } else if (columnDefault === 'false' || columnDefault.includes('false')) {
      sqlType += ' DEFAULT FALSE'
    } else if (columnDefault === 'true' || columnDefault.includes('true')) {
      sqlType += ' DEFAULT TRUE'
    } else if (columnDefault.match(/^nextval\(/)) {
      // Don't add serial defaults - they'll be handled by SERIAL type
      return sqlType
    } else if (!isNaN(Number(columnDefault.replace(/[()::]/g, '')))) {
      sqlType += ` DEFAULT ${columnDefault.replace(/[()::]/g, '')}`
    }
  }

  return sqlType
}

// Fetch all rows from a table using pagination
async function fetchTableData(tableName: string, chunkSize: number = 1000): Promise<Record<string, unknown>[]> {
  let offset = 0
  let allData: Record<string, unknown>[] = []
  let hasMore = true

  while (hasMore) {
    let rows: Record<string, unknown>[]
    try {
      // Try ordered query first
      rows = await queryRows(
        `SELECT * FROM "${tableName}" ORDER BY created_at ASC NULLS FIRST, id ASC NULLS FIRST LIMIT $1 OFFSET $2`,
        [chunkSize, offset]
      )
    } catch {
      // Fallback: some tables may not have created_at or id columns
      rows = await queryRows(
        `SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`,
        [chunkSize, offset]
      )
    }

    allData = allData.concat(rows)
    hasMore = rows.length === chunkSize
    offset += chunkSize
  }

  return allData
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // Check if operation is safe in production
    if (!isProductionSafeOperation()) {
      return NextResponse.json(
        { error: "Backup operations disabled in production. Set ALLOW_BACKUP_OPERATIONS=true to enable." },
        { status: 403 }
      )
    }

    const force = req.nextUrl.searchParams.get('force') === 'true'

    // Discover all tables
    const { tables, method, warnings } = await discoverTables()
    logger.info(`Exporting ${tables.length} tables using discovery method: ${method}`)

    if (warnings.length > 0) {
      logger.warn('Discovery warnings:', warnings)
    }

    // Schema and constraint discovery hit independent information_schema
    // queries — run concurrently before the per-table fetch loop.
    logger.info('Discovering all table schemas and constraints...')
    const [cachedSchemas, tableConstraints] = await Promise.all([
      discoverAllSchemas(tables),
      discoverAllConstraints(tables),
    ])
    const tablesWithCachedSchema = Object.entries(cachedSchemas).filter(([_, cols]) => cols.length > 0).length
    logger.info(`Cached schemas for ${tablesWithCachedSchema}/${tables.length} tables`)

    const backupData: Record<string, Record<string, unknown>[]> = {}
    const tableSchemas: Record<string, ColumnInfo[]> = {}
    const checksums: Record<string, string> = {}
    let totalRows = 0
    let errors: string[] = [...warnings]
    const failedTables: string[] = []

    // Process each table
    for (const table of tables) {
      if (!isValidTableName(table, tables)) {
        errors.push(`Skipping invalid table name: ${table}`)
        failedTables.push(table)
        continue
      }

      try {
        const allData = await fetchTableData(table)

        backupData[table] = allData
        checksums[table] = calculateChecksum(allData)
        totalRows += allData.length

        const schema = getTableSchemaFromCache(table, cachedSchemas, allData)
        if (schema.length > 0) {
          logger.info(`Schema for ${table}: ${schema.length} columns`)
        } else {
          logger.warn(`No schema available for ${table} (empty table with no cached schema)`)
        }
        tableSchemas[table] = schema

        logger.info(`Exported ${table}: ${allData.length} rows`)
      } catch (tableError: unknown) {
        logger.error(`Error exporting table ${table}:`, tableError)
        const message = tableError instanceof Error ? tableError.message : String(tableError)
        errors.push(`Error exporting ${table}: ${message}`)
        failedTables.push(table)
      }
    }

    // Default behavior: fail loudly if any table errored. Users explicitly
    // opt into a partial backup with ?force=true after seeing the error.
    if (failedTables.length > 0 && !force) {
      logger.error(`Export aborted: ${failedTables.length} tables failed`, failedTables)
      return NextResponse.json(
        {
          error: "Backup is incomplete: one or more tables failed to export.",
          failedTables,
          details: errors,
          hint: "Retry with ?force=true to download a partial backup anyway. Use only for debugging — restoring a partial backup will leave your database in an inconsistent state.",
        },
        { status: 500 }
      )
    }

    // Create metadata with checksums and discovery method
    const metadata = {
      version: '2.1',
      timestamp: new Date().toISOString(),
      exportedBy: user.id,
      discoveryMethod: method,
      tables: Object.keys(backupData),
      rowCounts: Object.fromEntries(
        Object.entries(backupData).map(([k, v]) => [k, (v as unknown[]).length])
      ),
      totalRows,
      checksums,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
      exportedFrom: 'ARI Backup System v2.1'
    }

    // Generate SQL content
    let sqlContent = `-- ================================================================\n`
    sqlContent += `-- ARI Database Backup v2.1\n`
    sqlContent += `-- Generated: ${metadata.timestamp}\n`
    sqlContent += `-- Exported by: ${metadata.exportedBy}\n`
    sqlContent += `-- Discovery Method: ${metadata.discoveryMethod}\n`
    sqlContent += `-- Total Tables: ${metadata.tables.length}\n`
    sqlContent += `-- Total Rows: ${metadata.totalRows}\n`
    if (warnings.length > 0) {
      sqlContent += `-- Warnings: ${warnings.length}\n`
    }
    sqlContent += `-- ================================================================\n\n`

    sqlContent += `-- Backup Metadata (DO NOT MODIFY)\n`
    sqlContent += `-- ${JSON.stringify(metadata)}\n\n`

    // Add transaction wrapper
    sqlContent += `-- Begin transaction for atomic import\n`
    sqlContent += `BEGIN;\n\n`

    sqlContent += `-- Disable foreign key checks temporarily\n`
    sqlContent += `SET session_replication_role = 'replica';\n\n`

    // Generate CREATE TABLE statements
    sqlContent += `-- Create tables with discovered schemas\n\n`

    for (const tableName of tables) {
      let schema = tableSchemas[tableName]

      // If schema is empty, try to infer from backup data
      if (!Array.isArray(schema) || schema.length === 0) {
        logger.warn(`No schema found for ${tableName}, inferring from data...`)
        const tableData = backupData[tableName]

        if (tableData && tableData.length > 0) {
          const sampleRow = tableData[0]
          schema = Object.entries(sampleRow).map(([columnName, value], index) => {
            let dataType = 'text'

            if (value === null) {
              dataType = 'text'
            } else if (typeof value === 'boolean') {
              dataType = 'boolean'
            } else if (typeof value === 'number') {
              dataType = Number.isInteger(value) ? 'integer' : 'numeric'
            } else if (typeof value === 'string') {
              if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
                dataType = 'uuid'
              } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                dataType = 'timestamp with time zone'
              } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                dataType = 'date'
              } else {
                dataType = 'text'
              }
            } else if (Array.isArray(value)) {
              dataType = 'array'
            } else if (typeof value === 'object') {
              dataType = 'jsonb'
            }

            return {
              column_name: columnName,
              data_type: dataType,
              is_nullable: 'YES',
              column_default: columnName === 'id' ? 'gen_random_uuid()' : (columnName.includes('created_at') || columnName.includes('updated_at') ? 'now()' : null),
              character_maximum_length: null
            }
          })

          logger.info(`Inferred schema for ${tableName} from data: ${schema.length} columns`)
        } else {
          logger.warn(`Empty table ${tableName} has no cached schema — included as comment only`)
          sqlContent += `-- Table: ${tableName} (empty, no schema available)\n\n`
          continue
        }
      }

      const constraints = tableConstraints[tableName] || { primaryKeys: [], uniqueKeys: [] }

      sqlContent += `-- Table: ${tableName}\n`
      sqlContent += `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n`
      sqlContent += `CREATE TABLE "${tableName}" (\n`

      const columns = schema.map((column) => {
        return `  "${column.column_name}" ${mapDataType(column.data_type, column.is_nullable, column.column_default, column.character_maximum_length)}`
      })

      // Add primary key constraint
      if (constraints.primaryKeys && constraints.primaryKeys.length > 0) {
        const pkColumns = constraints.primaryKeys.map((col: string) => `"${col}"`).join(', ')
        columns.push(`  PRIMARY KEY (${pkColumns})`)
      }

      // Add unique constraints
      if (constraints.uniqueKeys && constraints.uniqueKeys.length > 0) {
        constraints.uniqueKeys.forEach((uk: { name: string; columns: string[] }) => {
          if (uk.columns && uk.columns.length > 0) {
            const ukColumns = uk.columns.map((col: string) => `"${col}"`).join(', ')
            columns.push(`  CONSTRAINT "${uk.name}" UNIQUE (${ukColumns})`)
          }
        })
      }

      sqlContent += columns.join(',\n')
      sqlContent += `\n);\n\n`
    }

    // Add data inserts
    sqlContent += `-- Insert data\n\n`

    for (const [table, data] of Object.entries(backupData)) {
      if (!Array.isArray(data) || data.length === 0) {
        sqlContent += `-- Table: ${table} (no data)\n\n`
        continue
      }

      sqlContent += `-- Table: ${table} (${data.length} rows, checksum: ${checksums[table]})\n`
      sqlContent += `DELETE FROM "${table}";\n`

      // Batch inserts for better performance
      const batchSize = 100
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, Math.min(i + batchSize, data.length))

        for (const row of batch) {
          const columns = Object.keys(row).map(col => `"${col}"`).join(', ')
          const values = Object.values(row).map((val: unknown) => {
            if (val === null) return 'NULL'
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
            if (typeof val === 'number') return val
            if (typeof val === 'string') return `'${stripNul(val).replace(/'/g, "''")}'`
            if (val instanceof Date) return `'${val.toISOString()}'`
            if (Array.isArray(val)) {
              const escaped = val.map(v =>
                typeof v === 'string'
                  ? `"${stripNul(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
                  : String(v)
              )
              return `'{${escaped.join(',')}}'`
            }
            // JSONB/JSON objects
            if (typeof val === 'object') {
              return `'${stripNul(JSON.stringify(val)).replace(/'/g, "''")}'::jsonb`
            }
            // Fallback: coerce to string for safety
            return `'${stripNul(String(val)).replace(/'/g, "''")}'`
          }).join(', ')

          sqlContent += `INSERT INTO "${table}" (${columns}) VALUES (${values});\n`
        }
      }

      sqlContent += `\n`
    }

    // Create indexes for performance
    sqlContent += `-- Create indexes for better performance\n`
    for (const [tableName, schema] of Object.entries(tableSchemas)) {
      if (!Array.isArray(schema) || schema.length === 0) continue

      const indexedColumns = new Set<string>()

      schema.forEach(column => {
        const colName = column.column_name
        if (colName === 'id' || colName.endsWith('_id') || colName === 'user_id' ||
            colName === 'created_at' || colName === 'updated_at' || colName === 'completed' ||
            colName.includes('order') || colName.includes('index')) {
          if (!indexedColumns.has(colName)) {
            const safeIndexName = `idx_${tableName}_${colName}`.replace(/[^a-z0-9_]/gi, '_')
            sqlContent += `CREATE INDEX IF NOT EXISTS ${safeIndexName} ON "${tableName}"("${colName}");\n`
            indexedColumns.add(colName)
          }
        }
      })
    }
    sqlContent += `\n`

    // Reset sequences for any table/column that uses a sequence
    sqlContent += `-- Reset sequences\n`
    for (const [tableName, schema] of Object.entries(tableSchemas)) {
      if (!Array.isArray(schema)) continue
      for (const col of schema) {
        const def = col.column_default as string | null
        // Detect serial/identity columns by their default (nextval or identity)
        if (def && (def.includes('nextval') || def.includes('identity'))) {
          const colName = col.column_name
          sqlContent += `DO $$ BEGIN IF pg_get_serial_sequence('"${tableName}"', '${colName}') IS NOT NULL THEN PERFORM setval(pg_get_serial_sequence('"${tableName}"', '${colName}'), COALESCE((SELECT MAX("${colName}") FROM "${tableName}"), 0) + 1, false); END IF; END $$;\n`
        }
      }
    }
    sqlContent += `\n`

    // Re-enable constraints
    sqlContent += `-- Re-enable foreign key checks\n`
    sqlContent += `SET session_replication_role = 'origin';\n\n`

    // Commit transaction
    sqlContent += `-- Commit transaction\n`
    sqlContent += `COMMIT;\n\n`

    // Add verification queries
    sqlContent += `-- Verification queries (run these to verify backup integrity)\n`
    sqlContent += `-- Expected checksums:\n`
    for (const [table, checksum] of Object.entries(checksums)) {
      sqlContent += `-- ${table}: ${checksum}\n`
    }
    sqlContent += `\n`

    for (const table of tables) {
      if (backupData[table]) {
        const count = backupData[table].length
        sqlContent += `-- SELECT COUNT(*) as ${table.replace(/-/g, '_')}_count FROM "${table}"; -- Expected: ${count}\n`
      }
    }

    sqlContent += `\n-- End of backup\n`

    // Return the SQL file as a downloadable response
    return new NextResponse(sqlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="database-backup-${new Date().toISOString().split('T')[0]}.sql"`,
        'X-Backup-Metadata': JSON.stringify({
          tables: metadata.tables.length,
          rows: metadata.totalRows,
          timestamp: metadata.timestamp,
          discoveryMethod: method,
          warnings: warnings.length,
          errors: errors.length,
          failedTables: failedTables.length,
          partial: failedTables.length > 0,
        })
      }
    })

  } catch (error: unknown) {
    logger.error('Export error:', error)
    return NextResponse.json(
      { error: safeErrorResponse(error) },
      { status: 500 }
    )
  }
}
