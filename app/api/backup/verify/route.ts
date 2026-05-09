import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { logger } from '@/lib/logger'
import { queryRows, EXCLUDED_TABLES } from '../utils'
import type { RoleCheck } from '@/app/settings/types'

export const debugRole = "backup-verify"

interface TableInfo {
  name: string
  rowCount: number
  lastModified?: string
  status: 'accessible' | 'inaccessible' | 'unknown'
}

// Probe the connection's role and ability to read all rows. Catches the
// nightmare scenario where DATABASE_URL connects as a role that RLS would
// filter (e.g. a Supabase Cloud user who pasted the anon/authenticated
// pooler URL by mistake), which would silently produce a zero-row backup.
async function checkConnectionRole(): Promise<RoleCheck> {
  // The three probes are independent — run them in parallel and tolerate
  // individual failures (row_security may not be exposed on every Postgres
  // build, and the user-table read tells us about RLS rather than crashing).
  const [userResult, rsResult, countResult] = await Promise.allSettled([
    queryRows<{ current_user: string }>(`SELECT current_user`),
    queryRows<{ row_security: string }>(`SHOW row_security`),
    queryRows<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM public."user"`),
  ])

  if (userResult.status === 'rejected') {
    const err = userResult.reason
    return {
      status: 'critical',
      currentUser: null,
      rowSecurity: null,
      userTableCount: null,
      message: `Could not query current_user: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const currentUser = userResult.value[0]?.current_user ?? null
  const rowSecurity = rsResult.status === 'fulfilled' ? rsResult.value[0]?.row_security ?? null : null

  if (countResult.status === 'rejected') {
    const err = countResult.reason
    return {
      status: 'critical',
      currentUser,
      rowSecurity,
      userTableCount: null,
      message: `Cannot read public."user": ${err instanceof Error ? err.message : String(err)}. The DATABASE_URL role likely cannot bypass RLS — backup would be empty.`,
    }
  }

  const userTableCount = countResult.value[0]?.cnt ?? 0

  // The route requires an authenticated session, so by definition there is
  // at least one user in public."user". A zero count from the admin pool is
  // a strong signal RLS is filtering.
  if (userTableCount === 0) {
    return {
      status: 'critical',
      currentUser,
      rowSecurity,
      userTableCount,
      message: `Connection role "${currentUser}" sees 0 users but you are signed in. RLS is filtering the pool — DATABASE_URL must connect as a role that owns the tables or has BYPASSRLS. Backup would be incomplete.`,
    }
  }

  return {
    status: 'ok',
    currentUser,
    rowSecurity,
    userTableCount,
    message: `Connection role "${currentUser}" can read all rows.`,
  }
}

// Test table discovery via direct SQL
async function testDiscovery() {
  const result = {
    direct_sql: { success: false, tables: [] as string[], error: null as string | null }
  }

  try {
    const data = await queryRows<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    if (data.length > 0) {
      result.direct_sql.success = true
      result.direct_sql.tables = data
        .map(row => row.table_name)
        .filter(name => name && !EXCLUDED_TABLES.has(name))
    } else {
      result.direct_sql.error = 'No tables found'
    }
  } catch (error: unknown) {
    result.direct_sql.error = error instanceof Error ? error.message : String(error)
  }

  return result
}

// Get row counts for tables using pg_class for fast approximate counts
async function getRowCounts(tables: string[]): Promise<Record<string, number>> {
  const rowCounts: Record<string, number> = {}

  try {
    const counts = await queryRows<{ table_name: string; row_count: number }>(`
      SELECT c.relname as table_name, c.reltuples::bigint as row_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `)

    for (const row of counts) {
      if (tables.includes(row.table_name)) {
        rowCounts[row.table_name] = Number(row.row_count)
      }
    }

    if (Object.keys(rowCounts).length > 0) {
      return rowCounts
    }
  } catch (error: unknown) {
    logger.info('[Backup Verify] pg_class count not available, using fallback')
  }

  // Fallback: count individually
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) continue
    try {
      const result = await queryRows<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM "${table}"`
      )
      rowCounts[table] = result[0]?.cnt ?? 0
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

    logger.info(`[Backup Verify] Verification requested by user: ${user.id.slice(0, 8)}…`)

    // Role probe and table discovery hit independent SQL — run concurrently.
    const [roleCheck, discoveryResults] = await Promise.all([
      checkConnectionRole(),
      testDiscovery(),
    ])

    // Determine results
    let primaryMethod = 'none'
    let discoveredTables: string[] = []
    const warnings: string[] = []

    if (discoveryResults.direct_sql.success) {
      primaryMethod = 'direct_sql'
      discoveredTables = discoveryResults.direct_sql.tables
      logger.info(`[Backup Verify] Found ${discoveredTables.length} tables via direct SQL`)
    } else {
      primaryMethod = 'none'
      warnings.push('CRITICAL: Table discovery failed. Check database connectivity.')
      logger.error('[Backup Verify] Discovery failed!')
    }

    if (roleCheck.status === 'critical') {
      warnings.push(`CRITICAL: ${roleCheck.message}`)
    }

    // Get row counts for all tables
    const rowCounts = discoveredTables.length > 0
      ? await getRowCounts(discoveredTables)
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
      expectedTables: discoveredTables.length,
      totalRows,
      tables: tableInfo,
      warnings,
      missingTables: [],
      extraTables: [],
      discoveryResults,
      roleCheck,
      timestamp: new Date().toISOString()
    })

  } catch (error: unknown) {
    logger.error('[Backup Verify] Error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to verify backup system',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
