import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createClient } from "@supabase/supabase-js"
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
    const { data, error } = await client
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .not('table_name', 'in', '(spatial_ref_sys,schema_migrations)')
      .order('table_name')
    
    if (error) throw error
    return data?.map((row: any) => row.table_name) || []
  } catch (error) {
    console.error('Error discovering tables:', error)
    // Fallback to known tables
    return [
      'ari-database', 
      'fitness_database', 
      'contacts', 
      'fitness_completion_history', 
      'hyrox_station_records', 
      'hyrox_workouts', 
      'hyrox_workout_stations'
    ]
  }
}

// Get table schema information
async function getTableSchema(client: any, tableName: string) {
  try {
    const { data, error } = await client
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .order('ordinal_position')
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.warn(`Could not get schema for table ${tableName}:`, error)
    return []
  }
}

// Convert PostgreSQL data type to CREATE TABLE format
function mapDataType(dataType: string, isNullable: string, columnDefault: string | null): string {
  let sqlType = dataType.toUpperCase()
  
  // Map common types
  switch (dataType.toLowerCase()) {
    case 'character varying':
      sqlType = 'TEXT'
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
    case 'uuid':
      sqlType = 'UUID'
      break
    case 'date':
      sqlType = 'DATE'
      break
    case 'text':
      sqlType = 'TEXT'
      break
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
    } else if (columnDefault === 'false') {
      sqlType += ' DEFAULT FALSE'
    } else if (columnDefault === 'true') {
      sqlType += ' DEFAULT TRUE'
    } else if (!isNaN(Number(columnDefault))) {
      sqlType += ` DEFAULT ${columnDefault}`
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
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get service client
    const client = getServiceSupabase()
    
    // Discover all tables
    const tables = await discoverTables(client)
    console.log('Exporting tables:', tables)
    
    const backupData: any = {}
    const tableSchemas: any = {}
    const checksums: any = {}
    let totalRows = 0
    let errors: string[] = []
    
    // Use chunked fetching for large tables
    for (const table of tables) {
      try {
        // Get table schema first
        const schema = await getTableSchema(client, table)
        tableSchemas[table] = schema
        
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
              console.warn(`Could not export ${table}:`, unorderedError)
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
        
        console.log(`Exported ${table}: ${allData.length} rows`)
      } catch (tableError: any) {
        console.error(`Error exporting table ${table}:`, tableError)
        errors.push(`Error exporting ${table}: ${tableError.message}`)
      }
    }
    
    // Create metadata with checksums
    const metadata = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      exportedBy: userId,
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
    
    for (const [tableName, schema] of Object.entries(tableSchemas)) {
      if (!Array.isArray(schema) || schema.length === 0) continue
      
      sqlContent += `-- Table: ${tableName}\n`
      sqlContent += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`
      
      const columns = (schema as any[]).map((column) => {
        return `  "${column.column_name}" ${mapDataType(column.data_type, column.is_nullable, column.column_default)}`
      }).join(',\n')
      
      sqlContent += columns
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
      if (table === 'ari-database' || table === 'fitness_database') {
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
    console.error('Export error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export database' },
      { status: 500 }
    )
  }
}