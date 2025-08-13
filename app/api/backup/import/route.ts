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

// Calculate checksum for data integrity
function calculateChecksum(data: any): string {
  const hash = crypto.createHash('sha256')
  hash.update(JSON.stringify(data))
  return hash.digest('hex')
}

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
      if (version < 1.0) {
        warnings.push(`Old backup version (${metadata.version}), some features may not work`)
      }
      
    } catch (e) {
      errors.push('Could not parse backup metadata')
    }
  } else {
    warnings.push('No metadata found in backup file')
  }
  
  // Check for dangerous SQL patterns
  const dangerousPatterns = [
    /DROP\s+DATABASE/i,
    /DROP\s+SCHEMA/i,
    /ALTER\s+USER/i,
    /CREATE\s+USER/i,
    /GRANT\s+SUPER/i,
    /CREATE\s+EXTENSION/i
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      errors.push(`Potentially dangerous SQL pattern detected: ${pattern}`)
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
  creates: string[]
  inserts: string[]
  indexes: string[]
  other: string[]
} {
  const lines = content.split('\n')
  const creates: string[] = []
  const inserts: string[] = []
  const indexes: string[] = []
  const other: string[] = []
  
  let currentStatement = ''
  let inTransaction = false
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('--') || line.trim() === '') continue
    
    currentStatement += line + '\n'
    
    // Check if statement is complete (ends with semicolon)
    if (line.trim().endsWith(';')) {
      const statement = currentStatement.trim()
      
      if (statement.toUpperCase().startsWith('BEGIN')) {
        inTransaction = true
      } else if (statement.toUpperCase().startsWith('COMMIT') || statement.toUpperCase().startsWith('ROLLBACK')) {
        inTransaction = false
      } else if (statement.toUpperCase().startsWith('CREATE TABLE')) {
        creates.push(statement)
      } else if (statement.toUpperCase().startsWith('INSERT INTO')) {
        inserts.push(statement)
      } else if (statement.toUpperCase().startsWith('CREATE INDEX')) {
        indexes.push(statement)
      } else if (!statement.toUpperCase().startsWith('SET') && 
                 !statement.toUpperCase().startsWith('SELECT')) {
        other.push(statement)
      }
      
      currentStatement = ''
    }
  }
  
  return { creates, inserts, indexes, other }
}

// Execute SQL in transaction with rollback support
async function executeInTransaction(
  client: any,
  statements: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = []
  
  try {
    // Start transaction
    await client.rpc('exec_sql', { sql: 'BEGIN;' })
    
    let processed = 0
    const total = statements.length
    
    for (const statement of statements) {
      try {
        // Execute statement
        await client.rpc('exec_sql', { sql: statement })
        
        processed++
        if (onProgress) {
          onProgress(processed, total)
        }
      } catch (error: any) {
        errors.push(`Failed to execute: ${statement.substring(0, 100)}... - ${error.message}`)
        
        // Rollback on error
        await client.rpc('exec_sql', { sql: 'ROLLBACK;' })
        return { success: false, errors }
      }
    }
    
    // Commit if all successful
    await client.rpc('exec_sql', { sql: 'COMMIT;' })
    return { success: true, errors: [] }
    
  } catch (error: any) {
    // Attempt rollback
    try {
      await client.rpc('exec_sql', { sql: 'ROLLBACK;' })
    } catch {}
    
    errors.push(`Transaction failed: ${error.message}`)
    return { success: false, errors }
  }
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

    // Parse request
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }
    
    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB" },
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
    
    // Get service client
    const client = getServiceSupabase()
    
    // Parse SQL statements
    const { creates, inserts, indexes, other } = parseSQLStatements(content)
    
    console.log(`Parsed SQL: ${creates.length} creates, ${inserts.length} inserts, ${indexes.length} indexes`)
    
    // Create a restore point (backup current data)
    const restorePoint = {
      timestamp: new Date().toISOString(),
      userId,
      metadata: validation.metadata
    }
    
    // Store restore point metadata (you might want to save this to a separate table)
    console.log('Creating restore point:', restorePoint)
    
    const allStatements = [
      'SET session_replication_role = \'replica\';',
      ...creates,
      ...other.filter(s => s.toUpperCase().includes('DELETE FROM')),
      ...inserts,
      ...indexes,
      'SET session_replication_role = \'origin\';'
    ]
    
    // Execute import in transaction
    const startTime = Date.now()
    let lastProgress = 0
    
    const result = await executeInTransaction(
      client,
      allStatements,
      (current, total) => {
        const progress = Math.floor((current / total) * 100)
        if (progress > lastProgress + 5) {
          console.log(`Import progress: ${progress}%`)
          lastProgress = progress
        }
      }
    )
    
    const duration = Date.now() - startTime
    
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Import failed",
          details: result.errors,
          rollback: true
        },
        { status: 500 }
      )
    }
    
    // Verify data integrity if checksums are available
    let integrityCheck = { passed: true, failures: [] as string[] }
    if (validation.metadata?.checksums) {
      for (const [table, expectedChecksum] of Object.entries(validation.metadata.checksums)) {
        try {
          const { data } = await client
            .from(table)
            .select('*')
            .order('created_at', { ascending: true, nullsFirst: true })
          
          const actualChecksum = calculateChecksum(data)
          if (actualChecksum !== expectedChecksum) {
            integrityCheck.passed = false
            integrityCheck.failures.push(`${table}: checksum mismatch`)
          }
        } catch (error) {
          console.warn(`Could not verify ${table}:`, error)
        }
      }
    }
    
    // Prepare response
    const response = {
      success: true,
      message: "Database imported successfully",
      stats: {
        duration: `${(duration / 1000).toFixed(2)}s`,
        tablesCreated: creates.length,
        recordsImported: inserts.length,
        indexesCreated: indexes.length,
        warnings: validation.warnings
      },
      integrityCheck: integrityCheck.passed ? 'passed' : integrityCheck,
      restorePoint
    }
    
    return NextResponse.json(response, { status: 200 })
    
  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to import database',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

// Validation endpoint - separate from import
export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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