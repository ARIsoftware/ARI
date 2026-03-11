import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { getStorageProvider } from '../../../lib/providers'
import type { BackupManagerSettings } from '../../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../../types'
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Validate UUID format
    if (!id || !UUID_REGEX.test(id)) {
      logger.warn(`[Backup Delete] Invalid backup ID format: ${id}`)
      return NextResponse.json(
        { error: 'Invalid backup ID format' },
        { status: 400 }
      )
    }

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info(`[Backup Delete] User ${user.id} deleting backup ${id}`)

    const supabase = getServiceSupabase()

    // Get backup metadata
    const { data: backup, error: fetchError } = await supabase
      .from('backup_metadata')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !backup) {
      logger.warn(`[Backup Delete] Backup not found: ${id}`)
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
    }

    // Get backup settings for storage provider configuration
    const settingsResult = await withRLS((db) =>
      db.select()
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1)
    )

    const settings: BackupManagerSettings = settingsResult.length > 0
      ? { ...DEFAULT_BACKUP_SETTINGS, ...(settingsResult[0].settings as Partial<BackupManagerSettings>) }
      : DEFAULT_BACKUP_SETTINGS

    // IMPORTANT: Delete from database FIRST, then storage
    // This ensures that even if storage deletion fails, the backup record is removed
    // and won't appear in the UI (orphaned storage files are less problematic than
    // database records pointing to missing files)
    logger.info(`[Backup Delete] Deleting database record for backup ${id}`)
    const { error: deleteError } = await supabase
      .from('backup_metadata')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      logger.error(`[Backup Delete] Failed to delete database record: ${deleteError.message}`)
      throw deleteError
    }

    // Now delete from storage provider
    try {
      logger.info(`[Backup Delete] Deleting storage file: ${backup.storage_path}`)
      const provider = getStorageProvider(backup.storage_provider, settings)
      await provider.delete(backup.storage_path)
      logger.info(`[Backup Delete] Storage file deleted successfully`)
    } catch (storageError: any) {
      // Distinguish between "not found" errors and actual failures
      const errorMessage = storageError?.message?.toLowerCase() || ''
      const isNotFound = errorMessage.includes('not found') ||
                         errorMessage.includes('does not exist') ||
                         errorMessage.includes('404') ||
                         errorMessage.includes('no such file')

      if (isNotFound) {
        // File already doesn't exist - this is fine, database record is already deleted
        logger.info(`[Backup Delete] Storage file already deleted or not found (ignored)`)
      } else {
        // Actual storage error - log it but don't fail the request
        // since database record is already deleted
        logger.warn(`[Backup Delete] Storage deletion failed (non-critical): ${storageError.message}`)
        // Note: We don't throw here because the database record is already deleted.
        // The orphaned storage file can be cleaned up manually or via a cleanup job.
      }
    }

    logger.info(`[Backup Delete] Backup ${id} deleted successfully`)
    return NextResponse.json({ success: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete backup'
    logger.error(`[Backup Delete] Error: ${errorMessage}`)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
