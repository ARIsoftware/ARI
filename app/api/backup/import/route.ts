import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { requireAdmin } from '@/lib/api-helpers'
import { isProductionSafeOperation } from '@/lib/admin-helpers'
import { logActivity } from '@/lib/activity-log'
import { getPoolClient } from '@/lib/db'
import { reapplySchema } from '@/lib/db/ensure-schema'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'
import { MAX_BACKUP_FILE_BYTES, MAX_BACKUP_FILE_LABEL } from '@/lib/backup/constants'
import { parseBackup, type ParsedBackup } from '@/lib/backup/parse'
import { validateBackup } from '@/lib/backup/validate'
import { buildModuleHashInvalidationSql, runPostRestoreHealing } from '@/lib/backup/healing'
import { BackupImportRequestSchema, BackupImportResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, UnauthorizedResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

registry.registerPath({
  method: 'post',
  path: '/api/backup/import',
  operationId: 'importBackup',
  summary: 'Restore from a SQL backup file (transactional; rolls back on error or integrity mismatch)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: BackupImportRequestSchema } } } },
  responses: {
    200: { description: 'Import result', content: { 'application/json': { schema: BackupImportResponseSchema } } },
    400: { description: 'Invalid backup file', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    403: { description: 'Not allowed in production', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Import failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/backup/import',
  operationId: 'validateBackupFile',
  summary: 'Validate a backup file without applying it',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'multipart/form-data': { schema: BackupImportRequestSchema } } } },
  responses: {
    200: { description: 'Validation result', content: { 'application/json': { schema: BackupImportResponseSchema } } },
    400: { description: 'No file provided', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: { description: 'Validation failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

const SAFE_TABLE_NAME = /^[a-z_][a-z0-9_]*$/i

interface IntegrityResult {
  /** true when row counts were checked against metadata and all matched. */
  verified: boolean
  tablesChecked: number
  rowsVerified: number
}

type TransactionResult =
  | { success: true; integrity: IntegrityResult }
  | { success: false; errors: string[]; integrityFailure: boolean }

/**
 * Execute the restore in one transaction. The integrity row-count check runs
 * INSIDE the transaction, before COMMIT — a mismatch (or a table whose COUNT
 * fails) rolls everything back. Nothing is committed unless the restored data
 * matches the backup's own metadata.
 */
async function executeInTransaction(
  statements: string[],
  postRestoreStatements: string[],
  expectedRowCounts: Record<string, number> | null,
  onProgress?: (current: number, total: number) => void
): Promise<TransactionResult> {
  let client
  try {
    client = await getPoolClient()
  } catch (err) {
    return {
      success: false,
      errors: [`Failed to acquire DB connection: ${(err as Error).message}`],
      integrityFailure: false,
    }
  }

  try {
    await client.query('BEGIN')
    // Disable FK triggers for the duration of the data load. FK constraints
    // themselves arrive as validating ALTER TABLE ADD CONSTRAINT statements
    // after the data, so integrity is still enforced.
    await client.query("SET LOCAL session_replication_role = 'replica'")

    const all = [...statements, ...postRestoreStatements]
    let processed = 0

    for (const statement of all) {
      try {
        await client.query(statement)
        processed++
        onProgress?.(processed, all.length)
      } catch (error: unknown) {
        const preview = statement.substring(0, 120).replace(/\n/g, ' ')
        const message = error instanceof Error ? error.message : String(error)
        try { await client.query('ROLLBACK') } catch { /* ignore rollback errors */ }
        return { success: false, errors: [`Failed: ${preview}... — ${message}`], integrityFailure: false }
      }
    }

    // In-transaction integrity check: every table in the backup's metadata
    // must hold exactly the row count the backup promises.
    const integrity: IntegrityResult = { verified: false, tablesChecked: 0, rowsVerified: 0 }
    if (expectedRowCounts) {
      const failures: string[] = []
      let rowsVerified = 0
      for (const [table, expectedCount] of Object.entries(expectedRowCounts)) {
        if (!SAFE_TABLE_NAME.test(table)) {
          failures.push(`${table}: invalid table name in backup metadata`)
          continue
        }
        try {
          const result = await client.query(`SELECT COUNT(*)::int AS cnt FROM "${table}"`)
          const actualCount = result.rows[0]?.cnt ?? 0
          if (actualCount !== expectedCount) {
            failures.push(`${table}: expected ${expectedCount} rows, got ${actualCount}`)
          } else {
            rowsVerified += actualCount
          }
        } catch (error: unknown) {
          // A missing table after restore is an integrity failure, not a pass.
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`${table}: could not verify (${message})`)
        }
      }
      if (failures.length > 0) {
        try { await client.query('ROLLBACK') } catch { /* ignore rollback errors */ }
        return { success: false, errors: failures, integrityFailure: true }
      }
      integrity.verified = true
      integrity.tablesChecked = Object.keys(expectedRowCounts).length
      integrity.rowsVerified = rowsVerified
    }

    await client.query("SET LOCAL session_replication_role = 'origin'")
    await client.query('COMMIT')

    // A backup from the single-user era restores users without an admin.
    // Same self-healing rule as lib/db/setup.sql: promote the earliest user
    // when no admin exists. Best-effort — the boot backfill also covers it.
    try {
      await client.query(`UPDATE "user" SET "role" = 'admin'
        WHERE "id" = (SELECT "id" FROM "user" ORDER BY "createdAt" ASC LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM "user" WHERE "role" = 'admin')`)
    } catch { /* pre-multi-user backup may lack the column until next boot */ }

    return { success: true, integrity }

  } catch (error: unknown) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, errors: [`Transaction failed: ${message}`], integrityFailure: false }
  } finally {
    try { client.release() } catch { /* ignore */ }
  }
}

function orderedStatements(parsed: ParsedBackup): string[] {
  // drops → creates → deletes → inserts → indexes → other (FK ALTERs and
  // DO-blocks last, when all referenced rows exist)
  return [
    ...parsed.drops,
    ...parsed.creates,
    ...parsed.deletes,
    ...parsed.inserts,
    ...parsed.indexes,
    ...parsed.other,
  ]
}

async function handlePOST(req: NextRequest) {
  try {
    // Authenticate user
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // A restore rewrites every user's data — admin only.
    const denied = requireAdmin(user, "Backup import requires admin access")
    if (denied) return denied

    // Check if operation is safe in production
    if (!isProductionSafeOperation()) {
      return NextResponse.json(
        { error: "Backup operations are disabled because ALLOW_BACKUP_OPERATIONS=false. Unset it or set it to true to re-enable." },
        { status: 403 }
      )
    }

    // Parse request
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Shared cap with the Settings client (export has no limit, so import stays generous)
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_BACKUP_FILE_LABEL}` },
        { status: 400 }
      )
    }

    const content = await file.text()
    const parsed = parseBackup(content)
    const validation = validateBackup(content, parsed)

    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: "Invalid backup file",
          details: validation.errors
        },
        { status: 400 }
      )
    }

    logger.info(
      `Parsed SQL: ${parsed.drops.length} drops, ${parsed.creates.length} creates, ` +
      `${parsed.inserts.length} insert statements, ${parsed.indexes.length} indexes, ` +
      `${parsed.deletes.length} deletes, ${parsed.other.length} other`
    )

    const startTime = Date.now()
    let lastProgress = 0

    const result = await executeInTransaction(
      orderedStatements(parsed),
      // Inside the same transaction: invalidate module schema hashes so the
      // module registry reinstalls each enabled module's idempotent schema
      // (RLS policies, triggers, FKs, indexes) on the next authenticated
      // load. Changes JSONB values only — never row counts, so it cannot
      // trip the integrity check.
      [buildModuleHashInvalidationSql()],
      validation.metadata?.rowCounts ?? null,
      (current, total) => {
        const progress = Math.floor((current / total) * 100)
        if (progress > lastProgress + 5) {
          logger.info(`Import progress: ${progress}%`)
          lastProgress = progress
        }
      }
    )

    const duration = Date.now() - startTime

    if (!result.success) {
      logActivity({
        userId: user.id,
        type: 'backup_import_failed',
        description: result.integrityFailure
          ? 'Backup restore rolled back: integrity verification failed'
          : 'Backup restore rolled back: statement failed',
        metadata: { failureClass: result.integrityFailure ? 'integrity' : 'execution' },
      })
      if (result.integrityFailure) {
        return NextResponse.json(
          {
            error: "Integrity verification failed — all changes have been rolled back",
            details: result.errors,
            rollback: true,
            integrityCheck: { verified: false, failures: result.errors },
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        {
          error: "Import failed — all changes have been rolled back",
          details: result.errors,
          rollback: true
        },
        { status: 500 }
      )
    }

    // Core-schema healing after COMMIT: restore RLS policies, functions, and
    // any columns/tables the (possibly older) backup was missing. Module
    // schemas heal lazily via the hash invalidation above.
    const postRestore = await runPostRestoreHealing(reapplySchema)

    const response = {
      success: true,
      message: "Database imported successfully",
      stats: {
        duration: `${(duration / 1000).toFixed(2)}s`,
        tablesDropped: parsed.drops.length,
        tablesCreated: parsed.creates.length,
        insertStatements: parsed.inserts.length,
        recordsImported: result.integrity.verified ? result.integrity.rowsVerified : parsed.inserts.length,
        indexesCreated: parsed.indexes.length,
        warnings: validation.warnings
      },
      // Success now always means the in-transaction check passed (or the
      // backup carried no row-count metadata to check against). The legacy
      // string form is kept for older clients; `integrity` carries detail.
      integrityCheck: 'passed',
      integrity: result.integrity,
      postRestore: {
        moduleSchemasInvalidated: true,
        coreSchemaReapplied: postRestore.coreSchemaReapplied,
      },
    }

    // Best-effort: a restore from a pre-activity_log backup leaves the table
    // missing until the boot self-heal re-applies setup.sql, and the acting
    // admin's user row may not exist in a foreign backup — logActivity
    // swallows both failures.
    logActivity({
      userId: user.id,
      type: 'backup_imported',
      description: 'Imported database backup (full restore)',
      metadata: {
        tablesCreated: parsed.creates.length,
        recordsImported: response.stats.recordsImported,
        integrityVerified: result.integrity.verified,
        coreSchemaReapplied: postRestore.coreSchemaReapplied,
      },
    })

    return NextResponse.json(response, { status: 200 })

  } catch (error: unknown) {
    logger.error('Import error:', error)
    return NextResponse.json(
      { error: safeErrorResponse(error) },
      { status: 500 }
    )
  }
}

// Validation endpoint - separate from import
async function handlePUT(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Validation parses the full backup (all users' data) — admin only.
    const denied = requireAdmin(user, "Backup validation requires admin access")
    if (denied) return denied

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_BACKUP_FILE_LABEL}` },
        { status: 400 }
      )
    }

    const content = await file.text()
    const parsed = parseBackup(content)
    const validation = validateBackup(content, parsed)

    return NextResponse.json({
      valid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      metadata: validation.metadata,
      checksumVerified: validation.checksumVerified,
      statementCounts: {
        drops: parsed.drops.length,
        creates: parsed.creates.length,
        deletes: parsed.deletes.length,
        inserts: parsed.inserts.length,
        indexes: parsed.indexes.length,
        other: parsed.other.length,
      },
    })

  } catch (error: unknown) {
    return NextResponse.json(
      { error: safeErrorResponse(error) },
      { status: 500 }
    )
  }
}

export const POST = withApiLogging(handlePOST)
export const PUT = withApiLogging(handlePUT)
