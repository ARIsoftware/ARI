import { NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { requireAdmin } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'
import { getExactRowCounts } from '@/lib/backup/row-counts'
import { computeTableDiff, parseCreatedTables, type TableDiff } from '@/lib/backup/expected-tables'
import { setupSql } from '@/lib/db/setup-sql'
import { MODULE_SCHEMAS } from '@/lib/generated/module-schemas'
import { getEnabledModules } from '@/lib/modules/module-registry'
import { queryRows, EXCLUDED_TABLES } from '../utils'
import type { RoleCheck } from '@/app/(app)/settings/types'
import { BackupVerifyResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, UnauthorizedResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

export const debugRole = "backup-verify"

registry.registerPath({
  method: 'get',
  path: '/api/backup/verify',
  operationId: 'verifyBackupReadiness',
  summary: 'Preview tables and row counts that would be included in a backup (probes connection role + RLS)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Backup readiness report', content: { 'application/json': { schema: BackupVerifyResponseSchema } } },
    401: UnauthorizedResponse,
    500: { description: 'Verification failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

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

// Compare the live table list against what setup.sql + module schemas are
// expected to create. Best-effort: verify is a diagnostics endpoint and must
// degrade gracefully rather than fail.
async function computeExpectedTables(
  liveTables: string[],
  userId: string,
): Promise<{ diff: TableDiff | null; warning: string | null }> {
  try {
    const enabledIds = new Set((await getEnabledModules(userId)).map((m) => m.id))
    const core = parseCreatedTables(setupSql).filter((t) => !EXCLUDED_TABLES.has(t))
    const modules: Record<string, { tables: string[]; enabled: boolean }> = {}
    for (const [id, sql] of Object.entries(MODULE_SCHEMAS)) {
      modules[id] = {
        tables: parseCreatedTables(sql).filter((t) => !EXCLUDED_TABLES.has(t)),
        enabled: enabledIds.has(id),
      }
    }
    return { diff: computeTableDiff({ live: liveTables, core, modules }), warning: null }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { diff: null, warning: `Could not compute expected tables: ${message}` }
  }
}

async function handleGET() {
  try {
    // Authenticate user
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // Verify enumerates the full schema and row counts across all users —
    // admin only, same as export/import.
    const denied = requireAdmin(user, "Backup verification requires admin access")
    if (denied) return denied

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

    // Exact row counts (never reltuples estimates — this screen previews what
    // a backup will actually contain) plus the expected-table diff.
    const [{ counts, failures }, expected] = await Promise.all([
      discoveredTables.length > 0
        ? getExactRowCounts(queryRows, discoveredTables)
        : Promise.resolve({ counts: {} as Record<string, number>, failures: {} as Record<string, string> }),
      computeExpectedTables(discoveredTables, user.id),
    ])

    for (const [table, reason] of Object.entries(failures)) {
      warnings.push(`Table ${table} could not be counted: ${reason}`)
    }
    if (expected.warning) {
      warnings.push(expected.warning)
    }
    if (expected.diff && expected.diff.missing.length > 0) {
      warnings.push(`Missing expected tables: ${expected.diff.missing.join(', ')}`)
    }

    // Build detailed table info
    const tableInfo: TableInfo[] = discoveredTables.map(tableName => ({
      name: tableName,
      rowCount: counts[tableName] ?? 0,
      status: tableName in failures ? 'inaccessible' : 'accessible'
    }))

    const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0)

    // Determine overall status
    const status = discoveredTables.length === 0 ? 'critical' :
                   warnings.some(w => w.includes('CRITICAL')) ? 'critical' :
                   warnings.length > 0 ? 'warning' : 'ok'

    logger.info(`[Backup Verify] Complete: ${discoveredTables.length} tables, ${totalRows} rows, status: ${status}`)

    return NextResponse.json({
      status,
      discoveryMethod: primaryMethod,
      tablesFound: discoveredTables.length,
      expectedTables: expected.diff?.expectedCount ?? discoveredTables.length,
      totalRows,
      tables: tableInfo,
      warnings,
      missingTables: expected.diff?.missing ?? [],
      extraTables: expected.diff?.extra ?? [],
      discoveryResults,
      roleCheck,
      timestamp: new Date().toISOString()
    })

  } catch (error: unknown) {
    logger.error('[Backup Verify] Error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: safeErrorResponse(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

export const GET = withApiLogging(handleGET)
