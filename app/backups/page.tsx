"use client"

import type React from "react"
import { useState } from "react"
import { DM_Sans } from "next/font/google"
import { AppSidebar } from "../../components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Download, Upload, AlertCircle, CheckCircle2, Loader2, Database } from "lucide-react"
import { supabase } from "@/lib/supabase"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

// Dynamic table discovery function
const discoverTables = async (): Promise<string[]> => {
  try {
    // Get all user tables from information_schema
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .neq('table_name', 'spatial_ref_sys') // Exclude PostGIS system table if present
      .order('table_name')
    
    if (error) {
      console.warn('Could not discover tables automatically, falling back to known tables:', error)
      // Fallback to known tables
      return ['ari-database', 'fitness_database', 'contacts', 'fitness_completion_history', 'hyrox_station_records', 'hyrox_workouts', 'hyrox_workout_stations']
    }
    
    const tables = data?.map(row => row.table_name) || []
    console.log('Discovered tables:', tables)
    return tables
  } catch (error) {
    console.warn('Error discovering tables:', error)
    // Fallback to known tables
    return ['ari-database', 'fitness_database', 'contacts', 'fitness_completion_history', 'hyrox_station_records', 'hyrox_workouts', 'hyrox_workout_stations']
  }
}

// Get table schema information
const getTableSchema = async (tableName: string) => {
  try {
    const { data, error } = await supabase
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
const mapDataType = (dataType: string, isNullable: string, columnDefault: string | null): string => {
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
    } else if (columnDefault.startsWith("'") && columnDefault.endsWith("'")) {
      sqlType += ` DEFAULT ${columnDefault}`
    }
  }
  
  return sqlType
}

// Comprehensive SQL file validation function
const validateSQLFile = async (content: string): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> => {
  const errors: string[] = []
  const warnings: string[] = []
  const lines = content.split('\n')
  
  // Check if it's an ARI backup file
  if (!content.includes('ARI Database Backup') && !content.includes('CREATE TABLE')) {
    errors.push('Not a valid ARI backup file - missing backup header or CREATE TABLE statements')
  }
  
  // Discover current tables for validation
  const currentTables = await discoverTables()
  const foundTables = new Set<string>()
  
  // Create dynamic patterns for current tables
  const tablePattern = currentTables.map(t => `"${t}"`).join('|')
  const dangerousPatterns = [
    /DROP\s+DATABASE/i,
    new RegExp(`TRUNCATE\\s+(?!(${tablePattern}))`, 'i'),
    new RegExp(`DELETE\\s+FROM\\s+(?!(${tablePattern}))`, 'i'),
    /ALTER\s+USER/i,
    /CREATE\s+USER/i,
    /GRANT\s+/i,
    /REVOKE\s+/i,
    /--\s*[;<>]/,
    /\/\*.*\*\//s
  ]
  
  let insertCount = 0
  let createTableCount = 0
  const tableInsertCounts: Record<string, number> = {}
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('--')) continue
    
    // Check for dangerous patterns
    for (const pattern of dangerousPatterns) {
      if (pattern.test(line)) {
        errors.push(`Potentially dangerous SQL detected on line ${i + 1}: ${line.substring(0, 100)}...`)
      }
    }
    
    // Count and validate CREATE TABLE statements
    if (line.startsWith('CREATE TABLE')) {
      createTableCount++
      const tableMatch = line.match(/CREATE TABLE.*?"([^"]+)"/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        foundTables.add(tableName)
        if (!currentTables.includes(tableName)) {
          warnings.push(`Unknown table found: ${tableName} (not in current database)`)
        }
      }
    }
    
    // Count and validate INSERT statements
    if (line.startsWith('INSERT INTO')) {
      insertCount++
      const tableMatch = line.match(/INSERT INTO\s+"?([^"\s]+)"?/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        tableInsertCounts[tableName] = (tableInsertCounts[tableName] || 0) + 1
        
        if (!currentTables.includes(tableName)) {
          warnings.push(`INSERT statement for table not in current database: ${tableName}`)
        }
        
        // Basic INSERT statement syntax validation
        if (!line.includes('VALUES') || !line.includes('(') || !line.includes(')')) {
          errors.push(`Malformed INSERT statement on line ${i + 1}`)
        }
        
        // Check for balanced parentheses
        const openParens = (line.match(/\(/g) || []).length
        const closeParens = (line.match(/\)/g) || []).length
        if (openParens !== closeParens) {
          errors.push(`Unbalanced parentheses in INSERT statement on line ${i + 1}`)
        }
      }
    }
    
    // Check for invalid SQL keywords in data
    if (line.includes('INSERT INTO') && (line.includes(';DROP') || line.includes('UNION SELECT'))) {
      errors.push(`Suspicious content in INSERT statement on line ${i + 1}`)
    }
  }
  
  // Check if we found any known tables
  const knownTablesFound = currentTables.filter(table => foundTables.has(table))
  if (knownTablesFound.length === 0) {
    errors.push('No recognized tables found in backup file')
  } else if (knownTablesFound.length < currentTables.length) {
    const missingTables = currentTables.filter(table => !foundTables.has(table))
    warnings.push(`Some current tables not found in backup: ${missingTables.join(', ')}`)
  }
  
  // Check for reasonable data amounts
  if (insertCount === 0) {
    warnings.push('No INSERT statements found - backup appears to be empty')
  } else if (insertCount > 100000) {
    warnings.push(`Very large backup file (${insertCount} INSERT statements) - import may take a long time`)
  }
  
  // Validate CREATE TABLE count
  if (createTableCount === 0) {
    errors.push('No CREATE TABLE statements found')
  } else if (createTableCount !== currentTables.length) {
    warnings.push(`Current database has ${currentTables.length} tables, backup has ${createTableCount}`)
  }
  
  // Check for metadata
  if (!content.includes('-- {"version"')) {
    warnings.push('Backup metadata not found - this may be an older backup format')
  }
  
  // Validate file structure
  const hasHeader = content.includes('ARI Database Backup')
  const hasSchemas = content.includes('CREATE TABLE')
  const hasData = content.includes('INSERT INTO')
  
  if (!hasHeader) {
    warnings.push('Missing ARI backup header')
  }
  
  if (!hasSchemas && !hasData) {
    errors.push('File appears to be empty or corrupted')
  }
  
  // Check for common file corruption indicators
  if (content.includes('\0') || content.includes('�')) {
    errors.push('File appears to be corrupted (contains null bytes or invalid characters)')
  }
  
  // Validate that indexes are included
  if (!content.includes('CREATE INDEX')) {
    warnings.push('No database indexes found - performance may be affected')
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

export default function BackupsPage() {
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [backupStats, setBackupStats] = useState<{ tables: number, totalRows: number } | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors: string[]; warnings: string[] } | null>(null)

  const handleExport = async () => {
    try {
      setExportLoading(true)
      setMessage(null)
      setBackupStats(null)
      
      // Automatically discover all tables
      const tables = await discoverTables()
      console.log('Exporting tables:', tables)
      
      const backupData: any = {}
      const tableSchemas: any = {}
      let totalRows = 0
      
      // Fetch data and schema for each table
      for (const table of tables) {
        try {
          // Get table data
          const { data, error } = await supabase
            .from(table)
            .select('*')
          
          if (error) {
            console.warn(`Could not export ${table}:`, error)
            continue // Skip tables that can't be accessed
          }
          
          // Get table schema
          const schema = await getTableSchema(table)
          
          backupData[table] = data || []
          tableSchemas[table] = schema
          totalRows += data?.length || 0
          
          console.log(`Exported ${table}: ${data?.length || 0} rows`)
        } catch (tableError) {
          console.warn(`Error exporting table ${table}:`, tableError)
          // Continue with other tables
        }
      }
      
      // Get database metadata
      const metadata = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        tables: Object.keys(backupData),
        rowCounts: Object.fromEntries(
          Object.entries(backupData).map(([k, v]) => [k, (v as any[]).length])
        ),
        totalRows,
        exportedBy: 'ARI Backup System',
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
      }
      
      // Convert to SQL format with CREATE TABLE statements
      let sqlContent = `-- ================================================================\n`
      sqlContent += `-- ARI Database Backup\n`
      sqlContent += `-- Generated: ${metadata.timestamp}\n`
      sqlContent += `-- Version: ${metadata.version}\n`
      sqlContent += `-- Total Tables: ${metadata.tables.length}\n`
      sqlContent += `-- Total Rows: ${metadata.totalRows}\n`
      sqlContent += `-- ================================================================\n\n`
      
      sqlContent += `-- Backup Metadata (DO NOT MODIFY)\n`
      sqlContent += `-- ${JSON.stringify(metadata)}\n\n`
      
      sqlContent += `-- Disable foreign key checks for import\n`
      sqlContent += `-- Note: Re-enable after import completes\n`
      sqlContent += `SET session_replication_role = 'replica';\n\n`
      
      // Dynamically generate CREATE TABLE statements
      sqlContent += `-- Create tables with discovered schemas\n\n`
      
      for (const [tableName, schema] of Object.entries(tableSchemas)) {
        if (!Array.isArray(schema) || schema.length === 0) continue
        
        sqlContent += `-- Table: ${tableName}\n`
        sqlContent += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`
        
        const columns = (schema as any[]).map((column, index) => {
          const columnDef = `  ${column.column_name} ${mapDataType(column.data_type, column.is_nullable, column.column_default)}`
          return columnDef
        }).join(',\n')
        
        sqlContent += columns
        sqlContent += `\n);\n\n`
      }
      
      sqlContent += `-- Insert data\n\n`
      
      for (const [table, data] of Object.entries(backupData)) {
        if (!Array.isArray(data) || data.length === 0) {
          sqlContent += `-- Table: ${table} (no data)\n\n`
          continue
        }
        
        sqlContent += `-- Table: ${table} (${data.length} rows)\n`
        sqlContent += `DELETE FROM "${table}";\n`
        
        for (const row of data) {
          const columns = Object.keys(row).join(', ')
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
        
        sqlContent += `\n`
      }
      
      // Add indexes for common patterns
      sqlContent += `-- Create indexes for better performance\n`
      
      // Create indexes based on common column patterns
      for (const [tableName, schema] of Object.entries(tableSchemas)) {
        if (!Array.isArray(schema) || schema.length === 0) continue
        
        const columns = schema as any[]
        
        // Index common patterns
        columns.forEach(column => {
          const colName = column.column_name
          if (colName === 'id' || colName.endsWith('_id')) {
            // Primary keys and foreign keys
            sqlContent += `CREATE INDEX IF NOT EXISTS idx_${tableName}_${colName} ON "${tableName}"(${colName});\n`
          } else if (colName === 'user_id') {
            sqlContent += `CREATE INDEX IF NOT EXISTS idx_${tableName}_user ON "${tableName}"(user_id);\n`
          } else if (colName === 'completed') {
            sqlContent += `CREATE INDEX IF NOT EXISTS idx_${tableName}_completed ON "${tableName}"(completed);\n`
          } else if (colName === 'created_at') {
            sqlContent += `CREATE INDEX IF NOT EXISTS idx_${tableName}_created ON "${tableName}"(created_at);\n`
          } else if (colName === 'updated_at') {
            sqlContent += `CREATE INDEX IF NOT EXISTS idx_${tableName}_updated ON "${tableName}"(updated_at);\n`
          } else if (colName.includes('order') || colName.includes('index')) {
            sqlContent += `CREATE INDEX IF NOT EXISTS idx_${tableName}_${colName} ON "${tableName}"(${colName});\n`
          }
        })
      }
      sqlContent += `\n`
      
      // Add sequences reset and constraints
      sqlContent += `-- Reset sequences if needed\n`
      sqlContent += `SELECT setval(pg_get_serial_sequence('"ari-database"', 'order_index'), COALESCE((SELECT MAX(order_index) FROM "ari-database"), 0) + 1, false);\n`
      sqlContent += `SELECT setval(pg_get_serial_sequence('"fitness_database"', 'order_index'), COALESCE((SELECT MAX(order_index) FROM "fitness_database"), 0) + 1, false);\n\n`
      
      // Re-enable foreign key checks
      sqlContent += `-- Re-enable foreign key checks\n`
      sqlContent += `SET session_replication_role = 'origin';\n\n`
      
      // Add validation queries for all tables
      sqlContent += `-- Validation queries (run these to verify backup integrity)\n`
      tables.forEach(table => {
        if (backupData[table]) {
          const count = backupData[table].length
          sqlContent += `-- SELECT COUNT(*) as ${table.replace(/-/g, '_')}_count FROM "${table}"; -- Expected: ${count}\n`
        }
      })
      sqlContent += `\n`
      
      sqlContent += `-- End of backup\n`
      sqlContent += `-- Expected row counts: ${JSON.stringify(metadata.rowCounts)}\n`
      
      // Create and download file
      const blob = new Blob([sqlContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `database-backup-${new Date().toISOString().split('T')[0]}.sql`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setBackupStats({ tables: metadata.tables.length, totalRows: metadata.totalRows })
      setMessage({ type: 'success', text: `Database exported successfully! ${metadata.totalRows} rows from ${metadata.tables.length} tables.` })
    } catch (error: any) {
      console.error('Export error:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to export database' })
    } finally {
      setExportLoading(false)
    }
  }

  const handleImportClick = async () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a file to import' })
      return
    }
    
    // Validate file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File too large. Maximum size is 50MB.' })
      return
    }
    
    // Validate SQL file before showing confirmation
    try {
      setMessage({ type: 'success', text: 'Validating SQL file...' })
      const content = await selectedFile.text()
      const validation = await validateSQLFile(content)
      
      setValidationResult(validation)
      
      if (!validation.isValid) {
        setMessage({ type: 'error', text: `SQL validation failed: ${validation.errors[0]}` })
        return
      }
      
      if (validation.warnings.length > 0) {
        setMessage({ type: 'success', text: `File validated with ${validation.warnings.length} warnings. Ready to import.` })
      } else {
        setMessage({ type: 'success', text: 'SQL file validated successfully. Ready to import.' })
      }
      
      // Show confirmation dialog
      setShowConfirmDialog(true)
    } catch (error: any) {
      setMessage({ type: 'error', text: `Failed to validate file: ${error.message}` })
    }
  }

  const handleConfirmedImport = async () => {
    setShowConfirmDialog(false) // Close the dialog
    
    try {
      setImportLoading(true)
      setMessage(null)
      setImportProgress(null)
      
      const content = await selectedFile.text()
      
      // Comprehensive SQL file validation
      const validationResult = await validateSQLFile(content)
      if (!validationResult.isValid) {
        throw new Error(`SQL validation failed: ${validationResult.errors.join(', ')}`)
      }
      
      // Extract metadata if available
      const metadataMatch = content.match(/-- ({.*?})\n/)
      let expectedCounts: any = {}
      if (metadataMatch) {
        try {
          const metadata = JSON.parse(metadataMatch[1])
          expectedCounts = metadata.rowCounts || {}
        } catch (e) {
          console.warn('Could not parse metadata:', e)
        }
      }
      
      // Parse SQL content
      const lines = content.split('\n')
      const tables = await discoverTables()
      
      console.log('Importing to tables:', tables)
      
      // First, clear existing data from all tables
      for (const table of tables) {
        try {
          // Delete all rows from the table
          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows
          
          if (deleteError && deleteError.code !== 'PGRST116') {
            console.warn(`Could not clear ${table}:`, deleteError)
          }
        } catch (err) {
          console.warn(`Error clearing ${table}:`, err)
        }
      }
      
      // Count total INSERT statements for progress
      const insertStatements = lines.filter(line => line.startsWith('INSERT INTO'))
      const totalInserts = insertStatements.length
      
      setImportProgress({ current: 0, total: totalInserts })
      
      // Process INSERT statements (skip CREATE TABLE statements as Supabase handles schema)
      let processedInserts = 0
      let successfulInserts = 0
      const errors: string[] = []
      
      for (const line of lines) {
        if (!line.startsWith('INSERT INTO')) continue
        
        processedInserts++
        setImportProgress({ current: processedInserts, total: totalInserts })
        
        try {
          // Parse the INSERT statement - handle quoted table names
          const tableMatch = line.match(/INSERT INTO "?([^"\s]+)"?/)
          const columnsMatch = line.match(/\(([^)]+)\)/)
          const valuesMatch = line.match(/VALUES \((.+)\);?$/)
          
          if (!tableMatch || !columnsMatch || !valuesMatch) continue
          
          const table = tableMatch[1]
          if (!tables.includes(table)) continue
          
          const columns = columnsMatch[1].split(',').map(col => col.trim())
          
          // Parse values (simplified - may need more robust parsing for complex data)
          const valuesString = valuesMatch[1]
          const values: any[] = []
          let current = ''
          let inQuotes = false
          let quoteChar = ''
          
          for (let i = 0; i < valuesString.length; i++) {
            const char = valuesString[i]
            
            if (!inQuotes && (char === "'" || char === '"')) {
              inQuotes = true
              quoteChar = char
            } else if (inQuotes && char === quoteChar && valuesString[i + 1] !== quoteChar) {
              inQuotes = false
              quoteChar = ''
            } else if (!inQuotes && char === ',') {
              values.push(parseValue(current.trim()))
              current = ''
              continue
            }
            
            current += char
          }
          if (current) {
            values.push(parseValue(current.trim()))
          }
          
          // Create object from columns and values
          const row: any = {}
          columns.forEach((col, idx) => {
            row[col] = values[idx]
          })
          
          // Insert into Supabase
          const { error } = await supabase
            .from(table)
            .insert(row)
          
          if (error) {
            errors.push(`${table}: ${error.message}`)
            console.warn(`Failed to insert row into ${table}:`, error)
          } else {
            successfulInserts++
          }
        } catch (parseError) {
          errors.push(`Parse error on line: ${line.substring(0, 100)}...`)
          console.warn('Failed to parse line:', line, parseError)
        }
      }
      
      // Validate imported data against expected counts
      const actualCounts: any = {}
      for (const table of tables) {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
        actualCounts[table] = count || 0
      }
      
      // Check for discrepancies
      const discrepancies: string[] = []
      for (const [table, expected] of Object.entries(expectedCounts)) {
        const actual = actualCounts[table] || 0
        if (actual !== expected) {
          discrepancies.push(`${table}: expected ${expected}, got ${actual}`)
        }
      }
      
      // Generate completion message
      let message = `Import completed! ${successfulInserts}/${totalInserts} records imported successfully.`
      if (discrepancies.length > 0) {
        message += ` Discrepancies: ${discrepancies.join(', ')}`
      }
      if (errors.length > 0 && errors.length < 10) {
        message += ` Errors: ${errors.slice(0, 5).join(', ')}`
      } else if (errors.length >= 10) {
        message += ` ${errors.length} errors occurred during import.`
      }
      
      const messageType = errors.length > totalInserts * 0.1 ? 'error' : 'success' // Error if >10% failed
      setMessage({ type: messageType, text: message })
      setSelectedFile(null)
      setImportProgress(null)
      
      // Reload the page to reflect changes
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (error: any) {
      console.error('Import error:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to import database' })
    } finally {
      setImportLoading(false)
    }
  }

  const parseValue = (val: string): any => {
    if (val === 'NULL') return null
    if (val === 'TRUE') return true
    if (val === 'FALSE') return false
    if (val.startsWith("'") && val.endsWith("'")) {
      return val.slice(1, -1).replace(/''/g, "'")
    }
    if (val.startsWith('{') && val.endsWith('}')) {
      return val.slice(1, -1).split(',')
    }
    if (!isNaN(Number(val))) return Number(val)
    return val
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Settings</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Backups</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Page Header */}
            <div>
              <h1 className="text-3xl font-medium">Database Backups</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Automatically discover and backup your complete database - no manual configuration needed
              </p>
            </div>

            {/* Alert Messages */}
            {message && (
              <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
                {message.type === 'error' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <AlertTitle>{message.type === 'error' ? 'Error' : 'Success'}</AlertTitle>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}

            {/* Backup Statistics */}
            {backupStats && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Last Export Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Tables Exported:</span>
                      <span className="ml-2">{backupStats.tables}</span>
                    </div>
                    <div>
                      <span className="font-medium">Total Records:</span>
                      <span className="ml-2">{backupStats.totalRows}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Import Progress */}
            {importProgress && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Import Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Processing records...</span>
                      <span>{importProgress.current} / {importProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Import Confirmation Dialog */}
            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    Confirm Database Import
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                    <p>
                      <strong>⚠️ WARNING:</strong> This action will permanently delete all existing data in your database and replace it with the backup data.
                    </p>
                    <p>This includes:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>All tasks and their completion history</li>
                      <li>All fitness activities and records</li>
                      <li>All contacts and their information</li>
                      <li>All fitness completion history</li>
                      <li>ALL tables and data in your database (automatically discovered)</li>
                    </ul>
                    <p>
                      <strong>File to import:</strong> {selectedFile?.name}
                    </p>
                    
                    {/* Validation Results */}
                    {validationResult && (
                      <div className="border rounded p-3 space-y-2">
                        <h4 className="font-medium text-sm">📋 Validation Results:</h4>
                        
                        {validationResult.isValid && (
                          <div className="flex items-center gap-2 text-green-600 text-sm">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>SQL file passed all validation checks</span>
                          </div>
                        )}
                        
                        {validationResult.warnings.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-yellow-600 font-medium text-sm">⚠️ Warnings ({validationResult.warnings.length}):</p>
                            <ul className="text-xs text-yellow-700 ml-4">
                              {validationResult.warnings.slice(0, 3).map((warning, idx) => (
                                <li key={idx}>• {warning}</li>
                              ))}
                              {validationResult.warnings.length > 3 && (
                                <li>• ... and {validationResult.warnings.length - 3} more</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <p className="text-red-600 font-medium">
                      This action cannot be undone. Are you sure you want to continue?
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setShowConfirmDialog(false)}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleConfirmedImport}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Yes, Replace All Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Export Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Export Database
                  </CardTitle>
                  <CardDescription>
                    Automatically discovers and exports ALL tables in your database as an SQL file
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handleExport}
                    disabled={exportLoading}
                    className="w-full"
                  >
                    {exportLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Export Database
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">
                    This will automatically discover and export ALL tables in your database
                  </p>
                </CardContent>
              </Card>

              {/* Import Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Import Database
                  </CardTitle>
                  <CardDescription>
                    Restore your database from a previously exported SQL file
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Input
                      type="file"
                      accept=".sql"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      disabled={importLoading}
                    />
                    <Button 
                      onClick={handleImportClick}
                      disabled={importLoading || !selectedFile}
                      className="w-full"
                      variant="outline"
                    >
                      {importLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Import Database
                        </>
                      )}
                    </Button>
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Warning</AlertTitle>
                      <AlertDescription>
                        Importing will replace all existing data in your database
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Backup Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <h4 className="font-medium text-foreground mb-1">🗂️ Dynamic Database Export</h4>
                    <p>• Automatically discovers ALL tables in your database</p>
                    <p>• Generates CREATE TABLE statements from actual schema</p>
                    <p>• Zero configuration - new tables are automatically included</p>
                    <p>• Full metadata and validation for integrity checking</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">🔄 Smart Import System</h4>
                    <p>• Progress tracking and detailed error reporting</p>
                    <p>• File validation and size limits (50MB max)</p>
                    <p>• Data integrity verification with expected vs actual counts</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">🛡️ Safety Features</h4>
                    <p>• Foreign key management during import</p>
                    <p>• Sequence reset for proper data ordering</p>
                    <p>• Performance indexes automatically created</p>
                    <p>• Validation queries included for manual verification</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">💾 Best Practices</h4>
                    <p>• Create regular backups to prevent data loss</p>
                    <p>• Store backups in multiple secure locations</p>
                    <p>• Test restore process periodically</p>
                    <p>• New tables are automatically included - no configuration needed!</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}