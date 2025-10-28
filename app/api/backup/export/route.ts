import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { requireAdmin, isProductionSafeOperation } from '@/lib/admin-helpers'
import { createClient } from "@supabase/supabase-js"
import { logger } from '@/lib/logger'
import crypto from "crypto"

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

// Dynamic table discovery
async function discoverTables(client: any): Promise<string[]> {
  try {
    logger.info('Starting table discovery...');

    // Method 1: Try querying each known table to see if it exists
    const knownTables = [
      'tasks',
      'fitness_database',
      'contacts',
      'fitness_completion_history',
      'hyrox_station_records',
      'hyrox_workouts',
      'hyrox_workout_stations',
      'northstar',
      'motivation_content',
      'shipments',
      'journal',
      'notepad',
      'notepad_revisions',
      'user_feature_preferences',
      'winter_arc_goals',
      'contribution_graph',
      'hello_world_entries',
      'module_migrations',
      'module_settings',
    ];

    const existingTables: string[] = [];

    for (const table of knownTables) {
      try {
        const { error } = await client
          .from(table)
          .select('*')
          .limit(1);

        if (!error) {
          existingTables.push(table);
          logger.info(`Found table: ${table}`);
        }
      } catch (tableError) {
        logger.info(`Table ${table} does not exist or is not accessible`);
      }
    }

    if (existingTables.length > 0) {
      logger.info('Discovered existing tables:', existingTables);
      return existingTables;
    }

    // Method 2: Fallback to information_schema query using raw SQL
    try {
      const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('spatial_ref_sys', 'schema_migrations')
        ORDER BY table_name;
      `;

      const { data, error } = await client.rpc('exec_sql', { query });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        const tables = data.map((row: any) => row.table_name).filter(Boolean);
        logger.info('Discovered tables via information_schema (raw SQL):', tables);
        return tables;
      }

      logger.warn('Information schema query via RPC failed or returned no results:', error);
    } catch (rpcError) {
      logger.warn('RPC exec_sql not available, using fallback:', rpcError);
    }
  } catch (error) {
    logger.error('Error discovering tables:', error)
    // Fallback to known tables
    return [
      'tasks',
      'fitness_database',
      'contacts',
      'fitness_completion_history',
      'hyrox_station_records',
      'hyrox_workouts',
      'hyrox_workout_stations',
      'northstar',
      'motivation_content',
      'shipments',
      'journal',
      'notepad',
      'notepad_revisions',
      'user_feature_preferences',
      'winter_arc_goals',
      'contribution_graph',
      'hello_world_entries',
      'module_migrations',
      'module_settings',
    ]
  }
}

// Get table schema information using SQL query
async function getTableSchema(client: any, tableName: string) {
  try {
    // Query information_schema directly using SQL
    const query = `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = '${tableName}'
      ORDER BY ordinal_position;
    `

    const { data, error } = await client.rpc('exec_sql', { query }).catch(() => ({ data: null, error: null }))

    if (data && Array.isArray(data) && data.length > 0) {
      logger.info(`Got schema for ${tableName} via RPC: ${data.length} columns`)
      return data
    }

    // Fallback: Get a sample row and infer types
    logger.warn(`RPC failed for ${tableName}, using sample row fallback`)
    const { data: sampleData } = await client
      .from(tableName)
      .select('*')
      .limit(1)
      .single()

    if (sampleData) {
      // Build basic schema from sample data
      const schema = Object.entries(sampleData).map(([columnName, value], index) => {
        let dataType = 'text'
        let isNullable = value === null ? 'YES' : 'NO'

        if (value === null) {
          dataType = 'text'
        } else if (typeof value === 'boolean') {
          dataType = 'boolean'
        } else if (typeof value === 'number') {
          dataType = Number.isInteger(value) ? 'integer' : 'numeric'
        } else if (typeof value === 'string') {
          // Check if it's a UUID
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
          is_nullable: isNullable,
          column_default: columnName === 'id' ? 'gen_random_uuid()' : (columnName.includes('created_at') || columnName.includes('updated_at') ? 'now()' : null),
          character_maximum_length: null,
          ordinal_position: index + 1
        }
      })

      logger.info(`Inferred schema for ${tableName}: ${schema.length} columns`)
      return schema
    }

    logger.warn(`Could not get schema for table ${tableName} - no sample data available`)
    return []
  } catch (error) {
    logger.error(`Error getting schema for table ${tableName}:`, error)
    return []
  }
}

// Get primary key constraints
async function getTableConstraints(client: any, tableName: string) {
  try {
    // Get primary key
    const { data: pkData } = await client.rpc('get_table_pk', { table_name: tableName }).catch(() => ({ data: null }))

    // Fallback: query information_schema for constraints
    const { data, error } = await client
      .from('information_schema.table_constraints')
      .select('constraint_name, constraint_type')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)

    if (error) {
      logger.warn(`Could not get constraints for ${tableName}:`, error)
      return { primaryKeys: [], uniqueKeys: [], foreignKeys: [] }
    }

    // Get key column usage
    const { data: keyData } = await client
      .from('information_schema.key_column_usage')
      .select('column_name, constraint_name')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)

    const constraints = data || []
    const keyColumns = keyData || []

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
    return { primaryKeys: [], uniqueKeys: [], foreignKeys: [] }
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

    // Require admin access
    try {
      requireAdmin(user.id)
    } catch (error) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
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
    
    // Discover all tables
    const tables = await discoverTables(client)
    logger.info('Exporting tables:', tables)
    
    const backupData: any = {}
    const tableSchemas: any = {}
    const tableConstraints: any = {}
    const checksums: any = {}
    let totalRows = 0
    let errors: string[] = []

    // Use chunked fetching for large tables
    for (const table of tables) {
      try {
        // Get table schema first
        const schema = await getTableSchema(client, table)
        logger.info(`Schema for ${table}:`, schema?.length || 0, 'columns')
        tableSchemas[table] = schema

        // Get table constraints
        const constraints = await getTableConstraints(client, table)
        logger.info(`Constraints for ${table}:`, constraints)
        tableConstraints[table] = constraints
        
        // Fetch data in chunks to avoid memory issues
        const chunkSize = 1000
        let offset = 0
        let allData: any[] = []
        let hasMore = true
        
        while (hasMore) {
          const { data, error, count } = await client
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
        
        logger.info(`Exported ${table}: ${allData.length} rows`)
      } catch (tableError: any) {
        logger.error(`Error exporting table ${table}:`, tableError)
        errors.push(`Error exporting ${table}: ${tableError.message}`)
      }
    }
    
    // Create metadata with checksums
    const metadata = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      exportedBy: user.id,
      tables: Object.keys(backupData),
      rowCounts: Object.fromEntries(
        Object.entries(backupData).map(([k, v]) => [k, (v as any[]).length])
      ),
      totalRows,
      checksums,
      errors: errors.length > 0 ? errors : undefined,
      exportedFrom: 'ARI Backup System v2.0'
    }
    
    // Generate SQL content
    let sqlContent = `-- ================================================================\n`
    sqlContent += `-- ARI Database Backup v2.0\n`
    sqlContent += `-- Generated: ${metadata.timestamp}\n`
    sqlContent += `-- Exported by: ${metadata.exportedBy}\n`
    sqlContent += `-- Total Tables: ${metadata.tables.length}\n`
    sqlContent += `-- Total Rows: ${metadata.totalRows}\n`
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
          errors: errors.length
        })
      }
    })
    
  } catch (error: any) {
    logger.error('Export error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export database' },
      { status: 500 }
    )
  }
}