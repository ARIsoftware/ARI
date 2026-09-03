import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { requireAdmin } from '@/lib/api-helpers'
import { isProductionSafeOperation } from '@/lib/admin-helpers'
import { logActivity } from '@/lib/activity-log'
import { getPoolClient } from '@/lib/db'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'
import { EXCLUDED_TABLES } from '@/lib/backup/constants'
import { BACKUP_VERSION, END_MARKER, assembleBackupFile, calculateChecksum } from '@/lib/backup/format'
import { buildInsertStatements } from '@/lib/backup/serialize'
import {
  discoverSchema,
  fetchTableRows,
  type QueryFn,
  type TableDefinition,
} from '@/lib/backup/schema-discovery'
import {
  generateCreateTable,
  generateForeignKeyStatements,
  generateIndexStatements,
} from '@/lib/backup/ddl'
import { BackupExportRequestSchema, BackupExportResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, UnauthorizedResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

export const debugRole = "backup-export"

registry.registerPath({
  method: 'post',
  path: '/api/backup/export',
  operationId: 'exportBackup',
  summary: 'Auto-discover all user tables and export as an executable SQL backup file',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: BackupExportRequestSchema } } } },
  responses: {
    200: { description: 'Backup result (SQL content + metadata)', content: { 'application/json': { schema: BackupExportResponseSchema } } },
    401: UnauthorizedResponse,
    403: { description: 'Not allowed in production', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Export failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

interface GatheredData {
  tables: TableDefinition[]
  rows: Record<string, Record<string, unknown>[]>
  errors: string[]
  failedTables: string[]
}

/**
 * Discover the schema and fetch every table's rows on ONE client inside a
 * REPEATABLE READ read-only transaction: schema, constraints, and all rows
 * share a single MVCC snapshot, so cross-table FK consistency of the dump is
 * guaranteed even while the app is live.
 */
async function gatherSnapshot(): Promise<GatheredData> {
  const client = await getPoolClient()
  const query: QueryFn = async (sql, params) => (await client.query(sql, params)).rows

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')

    const tables = await discoverSchema(query, EXCLUDED_TABLES)
    logger.info(`Discovered ${tables.length} tables via pg_catalog`)

    const rows: Record<string, Record<string, unknown>[]> = {}
    const errors: string[] = []
    const failedTables: string[] = []

    for (const table of tables) {
      try {
        rows[table.name] = await fetchTableRows(query, table)
        logger.info(`Exported ${table.name}: ${rows[table.name].length} rows`)
      } catch (tableError: unknown) {
        const message = tableError instanceof Error ? tableError.message : String(tableError)
        logger.error(`Error exporting table ${table.name}:`, tableError)
        errors.push(`Error exporting ${table.name}: ${message}`)
        failedTables.push(table.name)
      }
    }

    return { tables, rows, errors, failedTables }
  } finally {
    try { await client.query('ROLLBACK') } catch { /* read-only snapshot — nothing to undo */ }
    try { client.release() } catch { /* ignore */ }
  }
}

async function handlePOST(req: NextRequest) {
  try {
    // Authenticate user
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // Backups contain every user's rows (table discovery bypasses RLS) —
    // admin only.
    const denied = requireAdmin(user, "Backup export requires admin access")
    if (denied) return denied

    // Check if operation is safe in production
    if (!isProductionSafeOperation()) {
      return NextResponse.json(
        { error: "Backup operations are disabled because ALLOW_BACKUP_OPERATIONS=false. Unset it or set it to true to re-enable." },
        { status: 403 }
      )
    }

    const force = req.nextUrl.searchParams.get('force') === 'true'

    const { tables, rows, errors, failedTables } = await gatherSnapshot()

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

    const includedTables = tables.filter((t) => !failedTables.includes(t.name))
    const warnings: string[] = []

    // Serialize data + checksums (informational — integrity is proven by the
    // file-level contentSha256 plus in-transaction row counts on import).
    const checksums: Record<string, string> = {}
    const rowCounts: Record<string, number> = {}
    let totalRows = 0
    const insertSections: string[] = []
    for (const table of includedTables) {
      const tableRows = rows[table.name] ?? []
      checksums[table.name] = calculateChecksum(tableRows)
      rowCounts[table.name] = tableRows.length
      totalRows += tableRows.length

      if (tableRows.length === 0) {
        insertSections.push(`-- Table: ${table.name} (no data)\n`)
        continue
      }
      const statements = buildInsertStatements(table.name, tableRows)
      insertSections.push(
        `-- Table: ${table.name} (${tableRows.length} rows, checksum: ${checksums[table.name]})\n` +
        `DELETE FROM "${table.name}";\n` +
        statements.join('\n') + '\n'
      )
    }

    // DDL: exact catalog types, verbatim defaults, PK/UNIQUE/CHECK inline.
    const ddlSections: string[] = []
    for (const table of includedTables) {
      const { sql, warnings: ddlWarnings } = generateCreateTable(table)
      warnings.push(...ddlWarnings)
      ddlSections.push(`-- Table: ${table.name}\nDROP TABLE IF EXISTS "${table.name}" CASCADE;\n${sql}\n`)
    }

    // Real indexes (verbatim from pg_indexes; constraint-backed ones excluded).
    const indexStatements = includedTables.flatMap((table) => generateIndexStatements(table))

    // Foreign keys land AFTER all data as single-line validating ALTERs.
    const { statements: fkStatements, skipped: fkSkipped } = generateForeignKeyStatements(includedTables)
    for (const skipped of fkSkipped) {
      warnings.push(`Foreign key not exported: ${skipped}`)
    }

    // Sequence resets for identity/serial columns (defensive — none exist in
    // the schema today, but a restored identity column restarts at 1 without
    // this).
    const sequenceResets: string[] = []
    for (const table of includedTables) {
      for (const column of table.columns) {
        if (column.identity !== '' || (column.defaultExpr ?? '').includes('nextval')) {
          sequenceResets.push(
            `DO $$ BEGIN IF pg_get_serial_sequence('"${table.name}"', '${column.name}') IS NOT NULL THEN PERFORM setval(pg_get_serial_sequence('"${table.name}"', '${column.name}'), COALESCE((SELECT MAX("${column.name}") FROM "${table.name}"), 0) + 1, false); END IF; END $$;`
          )
        }
      }
    }

    const timestamp = new Date().toISOString()

    // Body = everything after the metadata line; exactly what contentSha256
    // covers and what import parses.
    let body = `\n-- Begin transaction for atomic import\nBEGIN;\n\n`
    body += `-- Disable foreign key checks during data load\nSET session_replication_role = 'replica';\n\n`
    body += `-- Create tables with discovered schemas\n\n`
    body += ddlSections.join('\n')
    body += `\n-- Insert data\n\n`
    body += insertSections.join('\n')
    if (indexStatements.length > 0) {
      body += `\n-- Recreate indexes\n${indexStatements.join('\n')}\n`
    }
    if (fkStatements.length > 0) {
      body += `\n-- Restore foreign keys (validated against the data above)\n${fkStatements.join('\n')}\n`
    }
    if (sequenceResets.length > 0) {
      body += `\n-- Reset sequences\n${sequenceResets.join('\n')}\n`
    }
    body += `\n-- Re-enable foreign key checks\nSET session_replication_role = 'origin';\n\n`
    body += `-- Commit transaction\nCOMMIT;\n\n`
    body += `-- Expected row counts:\n`
    for (const table of includedTables) {
      body += `-- SELECT COUNT(*) as ${table.name.replace(/-/g, '_')}_count FROM "${table.name}"; -- Expected: ${rowCounts[table.name]}\n`
    }
    body += `\n${END_MARKER}\n`

    const metadata = {
      version: BACKUP_VERSION,
      timestamp,
      exportedBy: user.id,
      discoveryMethod: 'pg_catalog',
      tables: includedTables.map((t) => t.name),
      rowCounts,
      totalRows,
      checksums,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
      exportedFrom: `ARI Backup System v${BACKUP_VERSION}`,
    }

    let header = `-- ================================================================\n`
    header += `-- ARI Database Backup v${BACKUP_VERSION}\n`
    header += `-- Generated: ${timestamp}\n`
    header += `-- Exported by: ${user.id}\n`
    header += `-- Total Tables: ${includedTables.length}\n`
    header += `-- Total Rows: ${totalRows}\n`
    if (warnings.length > 0) {
      header += `-- Warnings: ${warnings.length}\n`
    }
    header += `-- ================================================================\n\n`

    const sqlContent = assembleBackupFile(header, metadata, body)

    logActivity({
      userId: user.id,
      type: 'backup_exported',
      description: 'Exported database backup',
      metadata: {
        tables: includedTables.length,
        rows: totalRows,
        partial: failedTables.length > 0,
      },
    })

    // Return the SQL file as a downloadable response
    return new NextResponse(sqlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="database-backup-${timestamp.split('T')[0]}.sql"`,
        'X-Backup-Metadata': JSON.stringify({
          tables: includedTables.length,
          rows: totalRows,
          timestamp,
          discoveryMethod: 'pg_catalog',
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

export const POST = withApiLogging(handlePOST)
