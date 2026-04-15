import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { isProductionSafeOperation } from '@/lib/admin-helpers'
import { getPoolClient } from '@/lib/db'
import { logger } from '@/lib/logger'
import { safeErrorResponse } from '@/lib/api-error'

// Validate SQL file structure and content
async function validateSQLFile(content: string): Promise<{
  isValid: boolean
  errors: string[]
  warnings: string[]
  metadata?: any
}> {
  const errors: string[] = []
  const warnings: string[] = []

  // Check basic structure
  if (!content.includes('ARI Database Backup')) {
    errors.push('Not a valid ARI backup file')
  }

  // Extract and validate metadata
  const metadataMatch = content.match(/-- ({.*?})\n/)
  let metadata: any = null

  if (metadataMatch) {
    try {
      metadata = JSON.parse(metadataMatch[1])

      // Validate metadata structure
      if (!metadata.version || !metadata.timestamp || !metadata.tables) {
        errors.push('Invalid backup metadata structure')
      }

      // Check version compatibility
      const version = parseFloat(metadata.version)
      if (isNaN(version) || version < 1.0) {
        warnings.push(`Old or invalid backup version (${metadata.version}), some features may not work`)
      }

    } catch (e) {
      errors.push('Could not parse backup metadata')
    }
  } else {
    warnings.push('No metadata found in backup file')
  }

  // Check for dangerous SQL patterns
  const dangerousPatterns = [
    { pattern: /DROP\s+DATABASE/i, name: 'DROP DATABASE' },
    { pattern: /DROP\s+SCHEMA/i, name: 'DROP SCHEMA' },
    { pattern: /DROP\s+ROLE/i, name: 'DROP ROLE' },
    { pattern: /ALTER\s+USER/i, name: 'ALTER USER' },
    { pattern: /ALTER\s+DATABASE/i, name: 'ALTER DATABASE' },
    { pattern: /CREATE\s+USER/i, name: 'CREATE USER' },
    { pattern: /CREATE\s+ROLE/i, name: 'CREATE ROLE' },
    { pattern: /CREATE\s+FUNCTION/i, name: 'CREATE FUNCTION' },
    { pattern: /GRANT\s+SUPER/i, name: 'GRANT SUPER' },
    { pattern: /CREATE\s+EXTENSION/i, name: 'CREATE EXTENSION' },
    { pattern: /\bTRUNCATE\b/i, name: 'TRUNCATE' },
    { pattern: /\bCOPY\s+(TO|FROM)\b/i, name: 'COPY TO/FROM' },
  ]

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(content)) {
      errors.push(`Potentially dangerous SQL pattern detected: ${name}`)
    }
  }

  // Check for required sections
  if (!content.includes('CREATE TABLE') && !content.includes('INSERT INTO')) {
    errors.push('Backup file must contain table definitions or data')
  }

  // Validate SQL syntax basics
  const openParens = (content.match(/\(/g) || []).length
  const closeParens = (content.match(/\)/g) || []).length
  if (Math.abs(openParens - closeParens) > 10) {
    warnings.push('Possible syntax error: unbalanced parentheses')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata
  }
}

// Parse SQL statements safely
function parseSQLStatements(content: string): {
  drops: string[]
  creates: string[]
  inserts: string[]
  indexes: string[]
  deletes: string[]
  other: string[]
} {
  const lines = content.split('\n')
  const drops: string[] = []
  const creates: string[] = []
  const inserts: string[] = []
  const indexes: string[] = []
  const deletes: string[] = []
  const other: string[] = []

  let currentStatement = ''

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('--') || line.trim() === '') continue

    currentStatement += line + '\n'

    // Check if statement is complete (ends with semicolon)
    if (line.trim().endsWith(';')) {
      const statement = currentStatement.trim()
      const upper = statement.toUpperCase()

      // Skip transaction control and SET statements (we manage our own transaction)
      if (upper.startsWith('BEGIN') || upper.startsWith('COMMIT') ||
          upper.startsWith('ROLLBACK') || upper.startsWith('SET') ||
          upper.startsWith('SELECT')) {
        currentStatement = ''
        continue
      }

      if (upper.startsWith('DROP TABLE')) {
        drops.push(statement)
      } else if (upper.startsWith('CREATE TABLE')) {
        creates.push(statement)
      } else if (upper.startsWith('INSERT INTO')) {
        inserts.push(statement)
      } else if (upper.startsWith('CREATE INDEX')) {
        indexes.push(statement)
      } else if (upper.startsWith('DELETE FROM')) {
        deletes.push(statement)
      } else {
        other.push(statement)
      }

      currentStatement = ''
    }
  }

  return { drops, creates, inserts, indexes, deletes, other }
}

// Execute all SQL statements in a real database transaction via PG pool
async function executeInTransaction(
  statements: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = []
  let client

  try {
    client = await getPoolClient()
  } catch (err) {
    return {
      success: false,
      errors: [`Failed to acquire DB connection: ${(err as Error).message}`],
    }
  }

  try {
    await client.query('BEGIN')
    // Disable FK checks for the duration of the import
    await client.query("SET LOCAL session_replication_role = 'replica'")

    let processed = 0
    const total = statements.length

    for (const statement of statements) {
      try {
        await client.query(statement)
        processed++
        if (onProgress) {
          onProgress(processed, total)
        }
      } catch (error: any) {
        const preview = statement.substring(0, 120).replace(/\n/g, ' ')
        errors.push(`Failed: ${preview}... — ${error.message}`)
        // Rollback the entire transaction
        try { await client.query('ROLLBACK') } catch { /* ignore rollback errors */ }
        return { success: false, errors }
      }
    }

    // Re-enable FK checks and commit
    await client.query("SET LOCAL session_replication_role = 'origin'")
    await client.query('COMMIT')
    return { success: true, errors: [] }

  } catch (error: any) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    errors.push(`Transaction failed: ${error.message}`)
    return { success: false, errors }
  } finally {
    try { client.release() } catch { /* ignore */ }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
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

    // Parse request
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Check file size (max 200MB — export has no limit, so import should be generous)
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 200MB" },
        { status: 400 }
      )
    }

    // Read and validate file content
    const content = await file.text()
    const validation = await validateSQLFile(content)

    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: "Invalid backup file",
          details: validation.errors
        },
        { status: 400 }
      )
    }

    // Parse SQL statements
    const { drops, creates, inserts, indexes, deletes, other } = parseSQLStatements(content)

    logger.info(`Parsed SQL: ${drops.length} drops, ${creates.length} creates, ${inserts.length} inserts, ${indexes.length} indexes, ${deletes.length} deletes, ${other.length} other`)

    // Build execution order: drops → creates → deletes → inserts → indexes → other
    const allStatements = [
      ...drops,
      ...creates,
      ...deletes,
      ...inserts,
      ...indexes,
      ...other,
    ]

    // Execute import in a real PG transaction
    const startTime = Date.now()
    let lastProgress = 0

    const result = await executeInTransaction(
      allStatements,
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
      return NextResponse.json(
        {
          error: "Import failed — all changes have been rolled back",
          details: result.errors,
          rollback: true
        },
        { status: 500 }
      )
    }

    // Verify data integrity via row counts (lightweight and reliable)
    const SAFE_TABLE_NAME = /^[a-z_][a-z0-9_]*$/i
    let integrityCheck = { passed: true, failures: [] as string[] }
    if (validation.metadata?.rowCounts) {
      try {
        const verifyClient = await getPoolClient()
        try {
          for (const [table, expectedCount] of Object.entries(validation.metadata.rowCounts)) {
            // Validate table name to prevent SQL injection from crafted backup files
            if (!SAFE_TABLE_NAME.test(table)) {
              integrityCheck.failures.push(`${table}: invalid table name, skipped`)
              continue
            }
            try {
              const result = await verifyClient.query(`SELECT COUNT(*)::int AS cnt FROM "${table}"`)
              const actualCount = result.rows[0]?.cnt ?? 0
              if (actualCount !== expectedCount) {
                integrityCheck.passed = false
                integrityCheck.failures.push(`${table}: expected ${expectedCount} rows, got ${actualCount}`)
              }
            } catch {
              logger.warn(`Could not verify table ${table}`)
            }
          }
        } finally {
          verifyClient.release()
        }
      } catch (error) {
        logger.warn('Could not verify row counts:', error)
      }
    }

    // Prepare response
    const response = {
      success: true,
      message: "Database imported successfully",
      stats: {
        duration: `${(duration / 1000).toFixed(2)}s`,
        tablesDropped: drops.length,
        tablesCreated: creates.length,
        recordsImported: inserts.length,
        indexesCreated: indexes.length,
        warnings: validation.warnings
      },
      integrityCheck: integrityCheck.passed ? 'passed' : integrityCheck,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error: any) {
    logger.error('Import error:', error)
    return NextResponse.json(
      { error: safeErrorResponse(error) },
      { status: 500 }
    )
  }
}

// Validation endpoint - separate from import
export async function PUT(req: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const content = await file.text()
    const validation = await validateSQLFile(content)

    return NextResponse.json({
      valid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      metadata: validation.metadata
    })

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Validation failed' },
      { status: 500 }
    )
  }
}
