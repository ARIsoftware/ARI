# Improved ARI Backup System v2.0

## Overview

The ARI backup system has been completely redesigned for security, reliability, and performance. This document describes the improvements and how to use the enhanced backup functionality.

## What Was Fixed

### 🚨 Critical Issues Resolved

1. **Fixed Runtime Error**: Missing `supabase` import that caused import functionality to crash
2. **Security Vulnerabilities**: Moved all database operations to secure server-side API routes
3. **Memory Issues**: Implemented chunked processing to handle large databases
4. **Data Integrity**: Added checksums and transaction support with rollback capability

### ⚡ Major Improvements

1. **Server-Side Processing**: All backup operations now run securely on the server
2. **Atomic Transactions**: Import operations are wrapped in transactions with automatic rollback on failure
3. **Data Integrity Verification**: SHA-256 checksums ensure data wasn't corrupted during backup/restore
4. **Enhanced Validation**: Comprehensive SQL validation prevents dangerous operations
5. **Progress Tracking**: Real-time progress indication for long-running operations
6. **Error Recovery**: Detailed error reporting and automatic rollback on failures

## Architecture

```
Client (Browser)          Server API Routes           Database
     │                         │                        │
     ├─ Export Request ────────▶│                        │
     │                         ├─ Query Tables ────────▶│
     │                         ├─ Fetch Data ──────────▶│
     │                         ├─ Generate SQL ─────────│
     │                         ├─ Calculate Checksums ──│
     │◀─ Download SQL File ────┤                        │
     │                         │                        │
     ├─ Import Request ────────▶│                        │
     │                         ├─ Validate File ────────│
     │                         ├─ Begin Transaction ───▶│
     │                         ├─ Execute SQL ──────────▶│
     │                         ├─ Verify Checksums ─────▶│
     │                         ├─ Commit/Rollback ──────▶│
     │◀─ Import Status ────────┤                        │
```

## API Routes

### Export: `POST /api/backup/export`
- Securely exports entire database
- Automatically discovers all tables
- Generates comprehensive SQL with schema
- Includes data integrity checksums
- Handles chunked processing for large datasets

### Import: `POST /api/backup/import`
- Validates and imports SQL backup files
- Atomic transaction with rollback on failure
- Verifies data integrity using checksums
- Progress tracking and detailed error reporting

### Validation: `PUT /api/backup/import`
- Pre-validates SQL files before import
- Checks for dangerous SQL patterns
- Validates file structure and metadata

## Database Functions

The system includes several PostgreSQL functions for secure operations:

### `exec_sql(sql TEXT)`
- Safely executes raw SQL statements
- Used by import process for atomic operations
- Security definer function for controlled access

### `create_backup_snapshot()`
- Creates metadata snapshot of current database state
- Returns table counts and checksums
- Useful for pre-import verification

### `validate_table_access(table_name TEXT)`
- Validates table exists and is accessible
- Prevents unauthorized table access

## Security Features

1. **Server-Side Only**: No direct database access from client
2. **SQL Injection Prevention**: Comprehensive validation of SQL content
3. **Service Role Authentication**: Uses Supabase service role for secure operations
4. **Input Validation**: File size limits and content validation
5. **Transaction Isolation**: Atomic operations prevent partial updates

## Environment Variables Required

Add to your `.env.local`:
```bash
SUPABASE_SECRET_KEY=your_secret_key_here
```

## Setup Instructions

1. **Install Database Functions**:
   Run the SQL script: `scripts/create-backup-functions.sql`

2. **Add Secret Key**:
   Add `SUPABASE_SECRET_KEY` to your environment variables

3. **Deploy API Routes**:
   The new API routes are in `app/api/backup/`

## Usage

### Exporting Database
1. Navigate to `/backups` page
2. Click "Export Database" button
3. System automatically discovers and exports all tables
4. Downloads SQL file with complete schema and data

### Importing Database
1. Navigate to `/backups` page
2. Select SQL backup file
3. System validates file content and structure
4. Confirm import (WARNING: replaces all existing data)
5. System imports with progress tracking and integrity verification

## File Format

### Backup File Structure
```sql
-- ================================================================
-- ARI Database Backup v2.0
-- Generated: 2024-01-15T10:30:00.000Z
-- Exported by: user_12345
-- Total Tables: 7
-- Total Rows: 1500
-- ================================================================

-- Backup Metadata (DO NOT MODIFY)
-- {"version":"2.0","timestamp":"...","checksums":{...}}

BEGIN;
SET session_replication_role = 'replica';

-- CREATE TABLE statements with discovered schemas
-- INSERT statements with data
-- CREATE INDEX statements for performance

SET session_replication_role = 'origin';
COMMIT;
```

### Metadata Format
```json
{
  "version": "2.0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "exportedBy": "user_12345",
  "tables": ["ari-database", "fitness_database", ...],
  "rowCounts": {"ari-database": 150, "fitness_database": 89, ...},
  "totalRows": 1500,
  "checksums": {"ari-database": "abc123...", ...},
  "exportedFrom": "ARI Backup System v2.0"
}
```

## Error Handling

### Export Errors
- Individual table failures don't stop the entire export
- Warnings reported in metadata
- Partial exports clearly marked

### Import Errors
- Automatic rollback on any failure
- Detailed error messages with line numbers
- Integrity verification failures prevent completion
- Transaction isolation prevents partial updates

## Performance

### Export Performance
- Chunked processing (1000 records per chunk)
- Memory-efficient streaming
- Parallel table processing where possible

### Import Performance
- Batched INSERT operations
- Transaction optimization
- Index creation deferred until after data import

## Monitoring and Logging

### Server-Side Logging
```javascript
// Export logs
console.log('Exporting tables:', tables)
console.log(`Exported ${table}: ${data.length} rows`)

// Import logs
console.log(`Parsed SQL: ${creates.length} creates, ${inserts.length} inserts`)
console.log(`Import progress: ${progress}%`)
```

### Client-Side Progress
- Real-time progress bars
- Detailed status messages
- Error boundaries with fallback UI

## Best Practices

1. **Regular Backups**: Export database regularly to prevent data loss
2. **Secure Storage**: Store backup files in secure, encrypted locations
3. **Test Restores**: Periodically test restore process on non-production data
4. **Monitor File Sizes**: Large databases may need chunked processing adjustments
5. **Verify Integrity**: Always check integrity verification results after import

## Migration from v1.0

The new system is backward compatible with v1.0 backup files, but v2.0 files include:
- Enhanced metadata
- Integrity checksums
- Better error handling
- Transaction wrapping

## Troubleshooting

### Common Issues

1. **Missing Secret Key**
   ```
   Error: Missing Supabase environment variables
   ```
   Solution: Add `SUPABASE_SECRET_KEY` to environment

2. **Large File Import Timeouts**
   ```
   Error: Import timeout
   ```
   Solution: Increase server timeout or split large files

3. **Checksum Mismatch**
   ```
   Error: Data integrity check failed
   ```
   Solution: Re-export source database or check for data corruption

4. **Transaction Rollback**
   ```
   Error: Import failed and was rolled back
   ```
   Solution: Check error details, fix issues, and retry

### Debug Mode

Set `NODE_ENV=development` for enhanced error reporting including stack traces.

## Support

For issues with the backup system:
1. Check server logs for detailed error messages
2. Verify all environment variables are set
3. Ensure database functions are installed
4. Test with smaller backup files first

---

**Version**: 2.0  
**Last Updated**: 2024-01-15  
**Compatibility**: Next.js 15, Supabase, PostgreSQL  