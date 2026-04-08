import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from "@supabase/supabase-js"
import { logger } from '@/lib/logger'

export const debugRole = "backup-verify"

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

// Tables to exclude from backups (system/internal tables)
const EXCLUDED_TABLES = new Set([
  'spatial_ref_sys',
  'schema_migrations',
  'pg_stat_statements',
  'geography_columns',
  'geometry_columns',
])

interface TableInfo {
  name: string
  rowCount: number
  lastModified?: string
  status: 'accessible' | 'inaccessible' | 'unknown'
}

// Test table discovery methods
async function testDiscoveryMethods(client: any) {
  const results = {
    method1_rpc_function: { success: false, tables: [] as string[], error: null as string | null },
    method2_raw_sql: { success: false, tables: [] as string[], error: null as string | null },
    method3_information_schema: { success: false, tables: [] as string[], error: null as string | null }
  }

  // Test Method 1: RPC function
  try {
    const { data, error } = await client.rpc('get_all_user_tables')
    if (!error && data && Array.isArray(data) && data.length > 0) {
      results.method1_rpc_function.success = true
      results.method1_rpc_function.tables = data
        .map((row: any) => row.table_name)
        .filter((name: string) => name && !EXCLUDED_TABLES.has(name))
    } else {
      results.method1_rpc_function.error = error?.message || 'No data returned'
    }
  } catch (error: any) {
    results.method1_rpc_function.error = error.message
  }

  // Test Method 2: Raw SQL via exec_sql
  try {
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
      results.method2_raw_sql.success = true
      results.method2_raw_sql.tables = data
        .map((row: any) => row.table_name)
        .filter((name: string) => name && !EXCLUDED_TABLES.has(name))
    } else {
      results.method2_raw_sql.error = error?.message || 'No data returned'
    }
  } catch (error: any) {
    results.method2_raw_sql.error = error.message
  }

  // Test Method 3: Direct information_schema query
  try {
    const { data, error } = await client
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE')

    if (!error && data && data.length > 0) {
      results.method3_information_schema.success = true
      results.method3_information_schema.tables = data
        .map((row: any) => row.table_name)
        .filter((name: string) => name && !EXCLUDED_TABLES.has(name))
    } else {
      results.method3_information_schema.error = error?.message || 'No data returned'
    }
  } catch (error: any) {
    results.method3_information_schema.error = error.message
  }

  return results
}

// Get row counts for tables
async function getRowCounts(client: any, tables: string[]): Promise<Record<string, number>> {
  const rowCounts: Record<string, number> = {}

  // Try using RPC function first (faster)
  try {
    const { data, error } = await client.rpc('get_table_row_counts')
    if (!error && data && Array.isArray(data)) {
      data.forEach((row: any) => {
        if (tables.includes(row.table_name)) {
          rowCounts[row.table_name] = row.row_count
        }
      })

      if (Object.keys(rowCounts).length > 0) {
        return rowCounts
      }
    }
  } catch (error: any) {
    logger.info('[Backup Verify] RPC row count function not available, using fallback')
  }

  // Fallback: count individually
  for (const table of tables) {
    try {
      const { count, error } = await client
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (!error && count !== null) {
        rowCounts[table] = count
      } else {
        rowCounts[table] = 0
      }
    } catch {
      rowCounts[table] = 0
    }
  }

  return rowCounts
}

export async function GET(req: NextRequest) {
  try {
    // Authenticate user (any authenticated user can verify)
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    logger.info(`[Backup Verify] Verification requested by user: ${user.id}`)

    // Get service client
    const client = getServiceSupabase()

    // Test all discovery methods
    const discoveryResults = await testDiscoveryMethods(client)

    // Determine which method works best - trust the database, not a hardcoded list
    let primaryMethod = 'none'
    let discoveredTables: string[] = []
    const warnings: string[] = []

    if (discoveryResults.method1_rpc_function.success) {
      primaryMethod = 'rpc_function'
      discoveredTables = discoveryResults.method1_rpc_function.tables
      logger.info(`[Backup Verify] Method 1 (RPC) found ${discoveredTables.length} tables`)
    } else if (discoveryResults.method2_raw_sql.success) {
      primaryMethod = 'raw_sql'
      discoveredTables = discoveryResults.method2_raw_sql.tables
      warnings.push('RPC function not available - using raw SQL fallback. Consider running the migration.')
      logger.info(`[Backup Verify] Method 2 (raw SQL) found ${discoveredTables.length} tables`)
    } else if (discoveryResults.method3_information_schema.success) {
      primaryMethod = 'information_schema'
      discoveredTables = discoveryResults.method3_information_schema.tables
      warnings.push('RPC functions not available - using information_schema query')
      logger.info(`[Backup Verify] Method 3 (information_schema) found ${discoveredTables.length} tables`)
    } else {
      primaryMethod = 'none'
      warnings.push('CRITICAL: All discovery methods failed. Re-run lib/db/setup.sql in the Supabase SQL editor to install the backup RPC functions.')
      logger.error('[Backup Verify] All discovery methods failed!')
    }

    // Get row counts for all tables
    const rowCounts = discoveredTables.length > 0
      ? await getRowCounts(client, discoveredTables)
      : {}

    // Build detailed table info
    const tableInfo: TableInfo[] = discoveredTables.map(tableName => ({
      name: tableName,
      rowCount: rowCounts[tableName] || 0,
      status: rowCounts[tableName] !== undefined ? 'accessible' : 'inaccessible'
    }))

    const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)

    // Determine overall status
    const status = discoveredTables.length === 0 ? 'critical' :
                   warnings.some(w => w.includes('CRITICAL')) ? 'critical' :
                   warnings.length > 0 ? 'warning' : 'ok'

    logger.info(`[Backup Verify] Complete: ${discoveredTables.length} tables, ${totalRows} rows, status: ${status}`)

    return NextResponse.json({
      status,
      discoveryMethod: primaryMethod,
      tablesFound: discoveredTables.length,
      expectedTables: discoveredTables.length, // Trust what we discovered
      totalRows,
      tables: tableInfo,
      warnings,
      missingTables: [], // No hardcoded list to compare against
      extraTables: [], // No hardcoded list to compare against
      discoveryResults,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    logger.error('[Backup Verify] Error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error.message || 'Failed to verify backup system',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
