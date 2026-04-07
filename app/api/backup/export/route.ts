import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { isProductionSafeOperation } from '@/lib/admin-helpers'
import { createClient } from "@supabase/supabase-js"
import { logger } from '@/lib/logger'
import crypto from "crypto"
import { safeErrorResponse } from '@/lib/api-error'

// Create service role client for full database access
const getServiceSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
  
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Missing Supabase environment variables")
  }
  
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Dynamic table discovery with 3-tier approach
// Tables to exclude from backups (system/internal tables)
const EXCLUDED_TABLES = new Set([
  'spatial_ref_sys',
  'schema_migrations',
  'pg_stat_statements',
  'geography_columns',
  'geometry_columns',
])

async function discoverTables(client: any): Promise<{ tables: string[], method: string, warnings: string[] }> {
  const warnings: string[] = []

  try {
    logger.info('Starting table discovery (3-tier approach)...')

    // METHOD 1: Try RPC function get_all_user_tables() (most reliable)
    try {
      logger.info('Attempting Method 1: RPC function get_all_user_tables()')
      const { data, error } = await client.rpc('get_all_user_tables')

      if (!error && data && Array.isArray(data) && data.length > 0) {
        const tables = data
          .map((row: any) => row.table_name)
          .filter((name: string) => name && !EXCLUDED_TABLES.has(name))
        logger.info(`✅ Method 1 succeeded: Found ${tables.length} tables via RPC function`)

        return { tables, method: 'rpc_function', warnings }
      }

      if (error) {
        logger.warn('Method 1 failed:', error.message || error)
      } else {
        logger.warn('Method 1 returned no results')
      }
    } catch (rpcError: any) {
      logger.warn('Method 1 (RPC) failed:', rpcError.message)
    }

    // METHOD 2: Try raw SQL via exec_sql RPC function
    try {
      logger.info('Attempting Method 2: Raw SQL via exec_sql()')
      const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('spatial_ref_sys', 'schema_migrations', 'pg_stat_statements')
        ORDER BY table_name;
      `

      let data = null
      let error = null
      try {
        const result = await client.rpc('exec_sql', { query })
        data = result.data
        error = result.error
      } catch (rpcError: any) {
        error = rpcError
      }

      if (!error && data && Array.isArray(data) && data.length > 0) {
        const tables = data
          .map((row: any) => row.table_name)
          .filter((name: string) => name && !EXCLUDED_TABLES.has(name))
        logger.info(`✅ Method 2 succeeded: Found ${tables.length} tables via raw SQL`)

        warnings.push('Using Method 2 (raw SQL) - consider running migration for RPC functions')

        return { tables, method: 'raw_sql', warnings }
      }

      if (error) {
        logger.warn('Method 2 failed:', error.message || error)
      } else {
        logger.warn('Method 2 returned no results')
      }
    } catch (sqlError: any) {
      logger.warn('Method 2 (raw SQL) failed:', sqlError.message)
    }

    // METHOD 3: Query information_schema directly via Supabase
    try {
      logger.info('Attempting Method 3: Direct information_schema query')

      // Use a simpler approach - query a known table to get all table names
      const { data: schemaData, error: schemaError } = await client
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE')

      if (!schemaError && schemaData && schemaData.length > 0) {
        const tables = schemaData
          .map((row: any) => row.table_name)
          .filter((name: string) => name && !EXCLUDED_TABLES.has(name))
        logger.info(`✅ Method 3 succeeded: Found ${tables.length} tables via information_schema`)

        warnings.push('Using Method 3 (information_schema) - RPC functions not available')

        return { tables, method: 'information_schema', warnings }
      }

      if (schemaError) {
        logger.warn('Method 3 failed:', schemaError.message || schemaError)
      }
    } catch (schemaQueryError: any) {
      logger.warn('Method 3 (information_schema) failed:', schemaQueryError.message)
    }

    // All methods failed - do not use hardcoded fallback lists
    logger.error('❌ All discovery methods failed!')
    warnings.push('CRITICAL: All discovery methods failed. No tables found.')

    return { tables: [], method: 'none', warnings }

  } catch (error: any) {
    logger.error('Critical error in table discovery:', error)
    warnings.push(`Critical error during discovery: ${error.message}`)
    return { tables: [], method: 'error', warnings }
  }
}

// Validate table name against whitelist to prevent SQL injection
function isValidTableName(tableName: string, validTables: string[]): boolean {
  return validTables.includes(tableName) && /^[a-z_][a-z0-9_]*$/i.test(tableName)
}

// Discover all table schemas upfront in a single query
// This is more efficient and reliable than per-table queries
async function discoverAllSchemas(client: any, tables: string[]): Promise<Record<string, any[]>> {
  const allSchemas: Record<string, any[]> = {}

  // Initialize empty arrays for all tables
  for (const table of tables) {
    allSchemas[table] = []
  }

  try {
    // METHOD 1: Try dedicated get_all_table_columns() RPC (most reliable)
    logger.info('Attempting schema discovery via get_all_table_columns() RPC...')
    try {
      const { data, error } = await client.rpc('get_all_table_columns')
      if (!error && data && Array.isArray(data) && data.length > 0) {
        logger.info(`✅ Got all schemas via get_all_table_columns: ${data.length} columns total`)

        // Organize by table
        for (const row of data) {
          const tableName = row.table_name
          if (tables.includes(tableName)) {
            if (!allSchemas[tableName]) {
              allSchemas[tableName] = []
            }
            allSchemas[tableName].push({
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
      } else if (error) {
        logger.warn('get_all_table_columns RPC failed:', error.message || error)
      }
    } catch (rpcError: any) {
      logger.warn('get_all_table_columns RPC not available:', rpcError.message)
    }

    // METHOD 2: Try exec_sql RPC with information_schema query
    logger.info('Attempting schema discovery via exec_sql RPC...')
    const query = `
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `

    try {
      const result = await client.rpc('exec_sql', { query })
      if (!result.error && result.data && Array.isArray(result.data) && result.data.length > 0) {
        logger.info(`✅ Got all schemas via exec_sql: ${result.data.length} columns total`)

        for (const row of result.data) {
          const tableName = row.table_name
          if (tables.includes(tableName)) {
            if (!allSchemas[tableName]) {
              allSchemas[tableName] = []
            }
            allSchemas[tableName].push({
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
      } else if (result.error) {
        logger.warn('exec_sql for schemas failed:', result.error.message || result.error)
      }
    } catch (rpcError: any) {
      logger.warn('exec_sql RPC call failed for schemas:', rpcError.message)
    }

    // METHOD 3: Fallback warning - schema discovery failed
    logger.warn('⚠️ Schema discovery failed - empty tables will not have CREATE TABLE statements')
    logger.warn('Re-run lib/db/setup.sql in Supabase to install the backup RPC functions and enable full schema discovery')

    return allSchemas
  } catch (error: any) {
    logger.error('Critical error in schema discovery:', error)
    return allSchemas
  }
}

// Get schema for a single table (uses cached schemas or falls back to sample row)
function getTableSchemaFromCache(
  tableName: string,
  cachedSchemas: Record<string, any[]>,
  sampleData: any[] | null
): any[] {
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

// Get primary key constraints
async function getTableConstraints(client: any, tableName: string, validTables: string[]) {
  // Security: Validate tableName against whitelist before using in SQL
  if (!isValidTableName(tableName, validTables)) {
    logger.warn(`Invalid table name rejected for constraints: ${tableName}`)
    return { primaryKeys: [], uniqueKeys: [], foreignKeys: [] }
  }

  try {
    // Query information_schema via exec_sql RPC (Supabase doesn't expose information_schema via .from())
    const constraintsQuery = `
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = '${tableName}'
    `

    const keyColumnsQuery = `
      SELECT column_name, constraint_name
      FROM information_schema.key_column_usage
      WHERE table_schema = 'public'
        AND table_name = '${tableName}'
    `

    let constraints: any[] = []
    let keyColumns: any[] = []

    // Try exec_sql RPC for constraints
    try {
      const constraintsResult = await client.rpc('exec_sql', { query: constraintsQuery })
      if (!constraintsResult.error && constraintsResult.data) {
        constraints = constraintsResult.data
      }
    } catch (rpcError: any) {
      logger.info(`exec_sql not available for constraints on ${tableName}, skipping constraint discovery`)
    }

    // Try exec_sql RPC for key columns
    try {
      const keyColumnsResult = await client.rpc('exec_sql', { query: keyColumnsQuery })
      if (!keyColumnsResult.error && keyColumnsResult.data) {
        keyColumns = keyColumnsResult.data
      }
    } catch {
      // Already logged above
    }

    // If no constraints found via RPC, try to infer primary key from column names
    if (constraints.length === 0) {
      // Common convention: 'id' column is usually the primary key
      return { primaryKeys: ['id'], uniqueKeys: [], foreignKeys: [] }
    }

    const primaryKeys = constraints
      .filter((c: any) => c.constraint_type === 'PRIMARY KEY')
      .map((c: any) => {
        const cols = keyColumns.filter((k: any) => k.constraint_name === c.constraint_name)
        return cols.map((k: any) => k.column_name)
      })
      .flat()

    const uniqueKeys = constraints
      .filter((c: any) => c.constraint_type === 'UNIQUE')
      .map((c: any) => {
        const cols = keyColumns.filter((k: any) => k.constraint_name === c.constraint_name)
        return { name: c.constraint_name, columns: cols.map((k: any) => k.column_name) }
      })

    return { primaryKeys, uniqueKeys, foreignKeys: [] }
  } catch (error) {
    logger.warn(`Could not get constraints for ${tableName}:`, error)
    return { primaryKeys: ['id'], uniqueKeys: [], foreignKeys: [] }
  }
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

// Calculate checksum for data integrity
function calculateChecksum(data: any): string {
  const hash = crypto.createHash('sha256')
  hash.update(JSON.stringify(data))
  return hash.digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const { user, supabase: userSupabase } = await getAuthenticatedUser()
    
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

    // Get service client
    const client = getServiceSupabase()

    // Discover all tables with method tracking
    const { tables, method, warnings } = await discoverTables(client)
    logger.info(`Exporting ${tables.length} tables using discovery method: ${method}`)

    if (warnings.length > 0) {
      logger.warn('Discovery warnings:', warnings)
    }

    // Discover all schemas upfront in a single query (more efficient and reliable)
    logger.info('Discovering all table schemas upfront...')
    const cachedSchemas = await discoverAllSchemas(client, tables)
    const tablesWithCachedSchema = Object.entries(cachedSchemas).filter(([_, cols]) => cols.length > 0).length
    logger.info(`Cached schemas for ${tablesWithCachedSchema}/${tables.length} tables`)

    const backupData: any = {}
    const tableSchemas: any = {}
    const tableConstraints: any = {}
    const checksums: any = {}
    let totalRows = 0
    let errors: string[] = [...warnings]

    // Process each table
    for (const table of tables) {
      try {
        // Fetch data first (we may need it for schema inference)
        const chunkSize = 1000
        let offset = 0
        let allData: any[] = []
        let hasMore = true

        while (hasMore) {
          const { data, error } = await client
            .from(table)
            .select('*', { count: 'exact' })
            .range(offset, offset + chunkSize - 1)
            .order('created_at', { ascending: true, nullsFirst: true })

          if (error) {
            // Some tables might not have created_at, try without ordering
            const { data: unorderedData, error: unorderedError } = await client
              .from(table)
              .select('*')
              .range(offset, offset + chunkSize - 1)

            if (unorderedError) {
              logger.warn(`Could not export ${table}:`, unorderedError)
              errors.push(`Warning: Could not export table ${table}`)
              hasMore = false
              continue
            }

            allData = allData.concat(unorderedData || [])
            hasMore = (unorderedData?.length || 0) === chunkSize
          } else {
            allData = allData.concat(data || [])
            hasMore = (data?.length || 0) === chunkSize
          }

          offset += chunkSize
        }

        backupData[table] = allData
        checksums[table] = calculateChecksum(allData)
        totalRows += allData.length

        // Get schema from cache, or infer from data
        const schema = getTableSchemaFromCache(table, cachedSchemas, allData)
        if (schema.length > 0) {
          logger.info(`Schema for ${table}: ${schema.length} columns`)
        } else {
          logger.warn(`No schema available for ${table} (empty table with no cached schema)`)
        }
        tableSchemas[table] = schema

        // Get table constraints (pass tables list for validation)
        const constraints = await getTableConstraints(client, table, tables)
        logger.info(`Constraints for ${table}:`, constraints)
        tableConstraints[table] = constraints

        logger.info(`Exported ${table}: ${allData.length} rows`)
      } catch (tableError: any) {
        logger.error(`Error exporting table ${table}:`, tableError)
        errors.push(`Error exporting ${table}: ${tableError.message}`)
      }
    }
    
    // Create metadata with checksums and discovery method
    const metadata = {
      version: '2.1',
      timestamp: new Date().toISOString(),
      exportedBy: user.id,
      discoveryMethod: method,
      tables: Object.keys(backupData),
      rowCounts: Object.fromEntries(
        Object.entries(backupData).map(([k, v]) => [k, (v as any[]).length])
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
              dataType = 'array'  // Use lowercase to match PostgreSQL
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
          logger.warn(`Cannot create table ${tableName} - no schema and no data`)
          continue
        }
      }

      const constraints = tableConstraints[tableName] || { primaryKeys: [], uniqueKeys: [] }

      sqlContent += `-- Table: ${tableName}\n`
      sqlContent += `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n`
      sqlContent += `CREATE TABLE "${tableName}" (\n`

      const columns = (schema as any[]).map((column) => {
        return `  "${column.column_name}" ${mapDataType(column.data_type, column.is_nullable, column.column_default, column.character_maximum_length)}`
      })

      // Add primary key constraint
      if (constraints.primaryKeys && constraints.primaryKeys.length > 0) {
        const pkColumns = constraints.primaryKeys.map((col: string) => `"${col}"`).join(', ')
        columns.push(`  PRIMARY KEY (${pkColumns})`)
      }

      // Add unique constraints
      if (constraints.uniqueKeys && constraints.uniqueKeys.length > 0) {
        constraints.uniqueKeys.forEach((uk: any) => {
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
          const values = Object.values(row).map((val: any) => {
            if (val === null) return 'NULL'
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
            if (Array.isArray(val)) return `'{${val.join(',')}}'::TEXT[]`
            if (val instanceof Date) return `'${val.toISOString()}'`
            return val
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
      
      const columns = schema as any[]
      const indexedColumns = new Set<string>()
      
      columns.forEach(column => {
        const colName = column.column_name
        if (colName === 'id' || colName.endsWith('_id') || colName === 'user_id' || 
            colName === 'created_at' || colName === 'updated_at' || colName === 'completed' ||
            colName.includes('order') || colName.includes('index')) {
          if (!indexedColumns.has(colName)) {
            sqlContent += `CREATE INDEX IF NOT EXISTS idx_${tableName.replace(/-/g, '_')}_${colName} ON "${tableName}"("${colName}");\n`
            indexedColumns.add(colName)
          }
        }
      })
    }
    sqlContent += `\n`
    
    // Reset sequences
    sqlContent += `-- Reset sequences if needed\n`
    for (const table of tables) {
      if (table === 'tasks' || table === 'fitness_database') {
        sqlContent += `SELECT setval(pg_get_serial_sequence('"${table}"', 'order_index'), COALESCE((SELECT MAX(order_index) FROM "${table}"), 0) + 1, false);\n`
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
          errors: errors.length
        })
      }
    })
    
  } catch (error: any) {
    logger.error('Export error:', error)
    return NextResponse.json(
      { error: safeErrorResponse(error) },
      { status: 500 }
    )
  }
}