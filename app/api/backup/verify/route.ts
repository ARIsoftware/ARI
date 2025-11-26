import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from "@supabase/supabase-js"
import { logger } from '@/lib/logger'

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

// Known complete table list (should match export route)
const COMPLETE_TABLE_LIST = [
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
  'major_projects',
  'quotes',
  'cape_town',
  'ohtani_grid_cells',
]

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
    method3_individual: { success: false, tables: [] as string[], error: null as string | null }
  }

  // Test Method 1: RPC function
  try {
    const { data, error } = await client.rpc('get_all_user_tables')
    if (!error && data && Array.isArray(data) && data.length > 0) {
      results.method1_rpc_function.success = true
      results.method1_rpc_function.tables = data.map((row: any) => row.table_name)
    } else {
      results.method1_rpc_function.error = error?.message || 'No data returned'
    }
  } catch (error: any) {
    results.method1_rpc_function.error = error.message
  }

  // Test Method 2: Raw SQL
  try {
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('spatial_ref_sys', 'schema_migrations', 'pg_stat_statements')
      ORDER BY table_name;
    `
    const { data, error } = await client.rpc('exec_sql', { query })
    if (!error && data && Array.isArray(data) && data.length > 0) {
      results.method2_raw_sql.success = true
      results.method2_raw_sql.tables = data.map((row: any) => row.table_name)
    } else {
      results.method2_raw_sql.error = error?.message || 'No data returned'
    }
  } catch (error: any) {
    results.method2_raw_sql.error = error.message
  }

  // Test Method 3: Individual validation
  const validatedTables: string[] = []
  for (const table of COMPLETE_TABLE_LIST) {
    try {
      const { error } = await client.from(table).select('id').limit(1)
      if (!error) {
        validatedTables.push(table)
      }
    } catch {
      // Table not accessible
    }
  }

  if (validatedTables.length > 0) {
    results.method3_individual.success = true
    results.method3_individual.tables = validatedTables
  } else {
    results.method3_individual.error = 'No tables could be validated'
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
    logger.warn('RPC row count function not available:', error.message)
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
    } catch (error) {
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

    logger.info(`Backup verification requested by user: ${user.id}`)

    // Get service client
    const client = getServiceSupabase()

    // Test all discovery methods
    const discoveryResults = await testDiscoveryMethods(client)

    // Determine which method works best
    let primaryMethod = 'hardcoded_fallback'
    let discoveredTables: string[] = []
    const warnings: string[] = []

    if (discoveryResults.method1_rpc_function.success) {
      primaryMethod = 'rpc_function'
      discoveredTables = discoveryResults.method1_rpc_function.tables
    } else if (discoveryResults.method2_raw_sql.success) {
      primaryMethod = 'raw_sql'
      discoveredTables = discoveryResults.method2_raw_sql.tables
      warnings.push('RPC function not available - using raw SQL fallback')
    } else if (discoveryResults.method3_individual.success) {
      primaryMethod = 'individual_validation'
      discoveredTables = discoveryResults.method3_individual.tables
      warnings.push('RPC functions not available - using individual table validation')
    } else {
      primaryMethod = 'hardcoded_fallback'
      discoveredTables = COMPLETE_TABLE_LIST
      warnings.push('CRITICAL: All discovery methods failed - using hardcoded list')
    }

    // Check for missing or extra tables
    const missing = COMPLETE_TABLE_LIST.filter(t => !discoveredTables.includes(t))
    const extra = discoveredTables.filter(t => !COMPLETE_TABLE_LIST.includes(t))

    if (missing.length > 0) {
      warnings.push(`Missing expected tables: ${missing.join(', ')}`)
    }
    if (extra.length > 0) {
      warnings.push(`Found new tables not in known list: ${extra.join(', ')}`)
    }

    // Get row counts for all tables
    const rowCounts = await getRowCounts(client, discoveredTables)

    // Build detailed table info
    const tableInfo: TableInfo[] = discoveredTables.map(tableName => ({
      name: tableName,
      rowCount: rowCounts[tableName] || 0,
      status: rowCounts[tableName] !== undefined ? 'accessible' : 'inaccessible'
    }))

    const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)

    // Determine overall status
    const status = warnings.some(w => w.includes('CRITICAL')) ? 'critical' :
                   warnings.length > 0 ? 'warning' : 'ok'

    return NextResponse.json({
      status,
      discoveryMethod: primaryMethod,
      tablesFound: discoveredTables.length,
      expectedTables: COMPLETE_TABLE_LIST.length,
      totalRows,
      tables: tableInfo,
      warnings,
      missingTables: missing,
      extraTables: extra,
      discoveryResults,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    logger.error('Verification error:', error)
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
