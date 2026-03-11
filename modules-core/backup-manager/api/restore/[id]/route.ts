import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { getStorageProvider } from '../../../lib/providers'
import type { BackupManagerSettings } from '../../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../../types'
import crypto from 'crypto'
import { logger } from '@/lib/logger'

// Create service role client
function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

const MODULE_ID = 'backup-manager'

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Timeout for restore operations (10 minutes - restores can be slow)
const RESTORE_TIMEOUT_MS = 10 * 60 * 1000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()

  try {
    const { id } = await params

    // Validate UUID format
    if (!id || !UUID_REGEX.test(id)) {
      logger.warn(`[Backup Restore] Invalid backup ID format: ${id}`)
      return NextResponse.json(
        { error: 'Invalid backup ID format' },
        { status: 400 }
      )
    }

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info(`[Backup Restore] User ${user.id} restoring backup ${id}`)

    const supabase = getServiceSupabase()

    // Get backup metadata
    const { data: backup, error: fetchError } = await supabase
      .from('backup_metadata')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !backup) {
      logger.warn(`[Backup Restore] Backup not found: ${id}`)
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
    }

    // Get backup settings
    const settingsResult = await withRLS((db) =>
      db.select()
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1)
    )

    const settings: BackupManagerSettings = settingsResult.length > 0
      ? { ...DEFAULT_BACKUP_SETTINGS, ...(settingsResult[0].settings as Partial<BackupManagerSettings>) }
      : DEFAULT_BACKUP_SETTINGS

    // Download the backup file ONCE (fix: was downloading twice before)
    logger.info(`[Backup Restore] Downloading backup from ${backup.storage_provider}: ${backup.storage_path}`)
    const provider = getStorageProvider(backup.storage_provider, settings)

    let sqlContent: string
    try {
      const downloadPromise = provider.download(backup.storage_path)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Download timeout exceeded')), RESTORE_TIMEOUT_MS / 2)
      )

      sqlContent = await Promise.race([downloadPromise, timeoutPromise])
    } catch (downloadError: any) {
      if (downloadError.message === 'Download timeout exceeded') {
        logger.error(`[Backup Restore] Download timed out`)
        return NextResponse.json(
          { error: 'Backup download timed out' },
          { status: 504 }
        )
      }
      throw downloadError
    }

    logger.info(`[Backup Restore] Downloaded ${sqlContent.length} bytes`)

    // Verify checksum before restore
    if (backup.checksum) {
      const hash = crypto.createHash('sha256')
      hash.update(sqlContent)
      const calculatedChecksum = hash.digest('hex')

      if (calculatedChecksum !== backup.checksum) {
        logger.error(`[Backup Restore] Checksum mismatch!`)
        return NextResponse.json(
          { error: 'Backup integrity check failed. The file may be corrupted.' },
          { status: 400 }
        )
      }
      logger.info(`[Backup Restore] Checksum verified`)
    }

    // Validate SQL content structure
    if (!sqlContent.includes('BEGIN;') || !sqlContent.includes('COMMIT;')) {
      logger.warn(`[Backup Restore] SQL content missing transaction wrapper`)
    }

    // Create FormData with the downloaded content for the import endpoint
    const formData = new FormData()
    const blob = new Blob([sqlContent], { type: 'application/sql' })
    formData.append('file', blob, backup.filename)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // First, validate the backup
    logger.info(`[Backup Restore] Validating backup...`)
    const validateController = new AbortController()
    const validateTimeout = setTimeout(() => validateController.abort(), 30000)

    try {
      const validateResponse = await fetch(
        `${baseUrl}/api/backup/import`,
        {
          method: 'PUT',
          body: formData,
          signal: validateController.signal,
        }
      )

      clearTimeout(validateTimeout)

      if (!validateResponse.ok) {
        const error = await validateResponse.json().catch(() => ({}))
        throw new Error(error.error || 'Backup validation failed')
      }

      const validation = await validateResponse.json()
      if (!validation.valid) {
        throw new Error(`Invalid backup: ${validation.errors?.[0] || 'Unknown validation error'}`)
      }

      logger.info(`[Backup Restore] Validation passed: ${validation.stats?.tables || 0} tables, ${validation.stats?.rows || 0} rows`)
    } catch (error: any) {
      clearTimeout(validateTimeout)
      if (error.name === 'AbortError') {
        return NextResponse.json({ error: 'Validation timed out' }, { status: 504 })
      }
      throw error
    }

    // Now perform the actual import with timeout
    logger.info(`[Backup Restore] Performing import...`)
    const importFormData = new FormData()
    const importBlob = new Blob([sqlContent], { type: 'application/sql' })
    importFormData.append('file', importBlob, backup.filename)

    const importController = new AbortController()
    const importTimeout = setTimeout(() => importController.abort(), RESTORE_TIMEOUT_MS)

    try {
      const importResponse = await fetch(
        `${baseUrl}/api/backup/import`,
        {
          method: 'POST',
          body: importFormData,
          signal: importController.signal,
        }
      )

      clearTimeout(importTimeout)

      if (!importResponse.ok) {
        const error = await importResponse.json().catch(() => ({}))
        throw new Error(error.error || 'Backup restore failed')
      }

      const result = await importResponse.json()
      const duration = Date.now() - startTime

      logger.info(`[Backup Restore] Restore completed successfully in ${duration}ms`)

      return NextResponse.json({
        success: true,
        message: result.message || 'Backup restored successfully',
        stats: result.stats,
        duration,
      })
    } catch (error: any) {
      clearTimeout(importTimeout)
      if (error.name === 'AbortError') {
        logger.error(`[Backup Restore] Import timed out after ${RESTORE_TIMEOUT_MS}ms`)
        return NextResponse.json(
          { error: 'Restore operation timed out. The database may be in an inconsistent state.' },
          { status: 504 }
        )
      }
      throw error
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to restore backup'
    logger.error(`[Backup Restore] Error: ${errorMessage}`)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
