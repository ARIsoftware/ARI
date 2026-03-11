import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isBackupDue, isVercelCronRequest } from '../../lib/scheduler'
import { getStorageProvider, isProviderConfigured } from '../../lib/providers'
import { calculateExpirationDate } from '../../lib/retention'
import type { BackupManagerSettings, StorageProvider } from '../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../types'
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

// Timeout for backup operations (5 minutes)
const BACKUP_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Scheduled backup endpoint.
 * Called by Vercel Cron every hour (or manually for testing).
 * Checks if it's time for a backup based on user's timezone and actually creates the backup.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Verify the request is from Vercel Cron (in production)
    if (process.env.VERCEL === '1' && !isVercelCronRequest(request.headers)) {
      logger.warn('[Scheduled Backup] Unauthorized request rejected')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info('[Scheduled Backup] Starting scheduled backup check...')

    const supabase = getServiceSupabase()
    const results: { userId: string; status: string; error?: string; backupId?: string }[] = []

    // Get all users with backup-manager enabled
    const { data: allSettings, error: settingsError } = await supabase
      .from('module_settings')
      .select('user_id, settings')
      .eq('module_id', MODULE_ID)

    if (settingsError) {
      logger.error('[Scheduled Backup] Failed to fetch settings:', settingsError)
      throw settingsError
    }

    if (!allSettings || allSettings.length === 0) {
      logger.info('[Scheduled Backup] No users with backup settings found')
      return NextResponse.json({
        message: 'No users with backup settings found',
        processed: 0,
      })
    }

    logger.info(`[Scheduled Backup] Found ${allSettings.length} users with backup settings`)

    for (const row of allSettings) {
      const userId = row.user_id
      const settings: BackupManagerSettings = {
        ...DEFAULT_BACKUP_SETTINGS,
        ...(row.settings as Partial<BackupManagerSettings>),
      }

      // Skip if backups are disabled
      if (!settings.enabled) {
        results.push({ userId, status: 'skipped', error: 'Backups disabled' })
        continue
      }

      // Check if storage provider is configured
      const providerConfig = isProviderConfigured(settings.storageProvider as StorageProvider)
      if (!providerConfig.configured) {
        logger.warn(`[Scheduled Backup] User ${userId}: Storage provider not configured`)
        results.push({
          userId,
          status: 'skipped',
          error: `Storage provider '${settings.storageProvider}' not configured`,
        })
        continue
      }

      // Get user's timezone
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', userId)
        .single()

      const timezone = prefs?.timezone || 'UTC'

      // Check if backup is due
      const { isDue, reason } = isBackupDue(settings.lastBackupAt, timezone)

      if (!isDue) {
        results.push({ userId, status: 'skipped', error: reason })
        continue
      }

      logger.info(`[Scheduled Backup] User ${userId}: Backup is due, creating backup...`)

      try {
        // Create backup for this user with timeout
        const backupResult = await Promise.race([
          createBackupForUser(supabase, userId, settings),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Backup timeout exceeded')), BACKUP_TIMEOUT_MS)
          ),
        ])

        // Update lastBackupAt in settings
        const updatedSettings = {
          ...settings,
          lastBackupAt: new Date().toISOString(),
        }

        await supabase
          .from('module_settings')
          .update({
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('module_id', MODULE_ID)

        logger.info(`[Scheduled Backup] User ${userId}: Backup created successfully (${backupResult.id})`)
        results.push({
          userId,
          status: 'success',
          backupId: backupResult.id,
        })
      } catch (backupError) {
        const errorMsg = backupError instanceof Error ? backupError.message : 'Unknown error'
        logger.error(`[Scheduled Backup] User ${userId}: Backup failed:`, errorMsg)
        results.push({
          userId,
          status: 'error',
          error: errorMsg,
        })
      }
    }

    const processed = results.filter((r) => r.status === 'success').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errors = results.filter((r) => r.status === 'error').length
    const duration = Date.now() - startTime

    logger.info(
      `[Scheduled Backup] Complete: ${processed} created, ${skipped} skipped, ${errors} errors (${duration}ms)`
    )

    return NextResponse.json({
      message: `Backup check complete: ${processed} created, ${skipped} skipped, ${errors} errors`,
      processed,
      skipped,
      errors,
      duration,
      results,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Scheduled backup failed'
    logger.error('[Scheduled Backup] Fatal error:', errorMsg)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

/**
 * Creates a backup for a specific user using the service role client.
 * This is called during scheduled backups where we don't have user session cookies.
 */
async function createBackupForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  settings: BackupManagerSettings
): Promise<{ id: string; filename: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // For scheduled backups, we need to call the export endpoint with service-level access
  // We'll add a special header that the export endpoint can validate
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.BETTER_AUTH_SECRET

  if (!internalSecret) {
    throw new Error('Internal API secret not configured')
  }

  // Create a timeout controller for the fetch
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BACKUP_TIMEOUT_MS - 30000) // Leave 30s buffer

  try {
    // Call export endpoint with internal authentication
    const exportResponse = await fetch(`${baseUrl}/api/backup/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': internalSecret,
        'X-User-Id': userId,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!exportResponse.ok) {
      const errorText = await exportResponse.text()
      let errorMessage = 'Failed to create backup export'

      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error || errorMessage
      } catch {
        if (errorText) {
          errorMessage = errorText.substring(0, 200)
        }
      }

      throw new Error(`Export failed: ${errorMessage}`)
    }

    const sqlContent = await exportResponse.text()

    // Validate we got actual SQL content
    if (!sqlContent || sqlContent.length < 100) {
      throw new Error('Export returned empty or invalid content')
    }

    // Parse metadata from the export
    const metadataMatch = sqlContent.match(/-- ({.*})/)
    let tableCount = 0
    let rowCount = 0

    if (metadataMatch) {
      try {
        const metadata = JSON.parse(metadataMatch[1])
        tableCount = metadata.tables?.length || 0
        rowCount = metadata.totalRows || 0
      } catch {
        logger.warn(`[Scheduled Backup] User ${userId}: Could not parse export metadata`)
      }
    }

    // Calculate checksum
    const hash = crypto.createHash('sha256')
    hash.update(sqlContent)
    const checksum = hash.digest('hex')

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup-${timestamp}.sql`

    // Upload to storage provider
    const provider = getStorageProvider(settings.storageProvider as StorageProvider, settings)
    const uploadResult = await provider.upload(filename, sqlContent)

    // Calculate expiration date
    const createdAt = new Date()
    const expiresAt = calculateExpirationDate(createdAt, settings.retentionDays)

    // Save metadata to database
    const { data: backup, error: insertError } = await supabase
      .from('backup_metadata')
      .insert({
        user_id: userId,
        filename,
        storage_provider: settings.storageProvider,
        storage_path: uploadResult.path,
        size_bytes: uploadResult.size,
        table_count: tableCount,
        row_count: rowCount,
        checksum,
        expires_at: expiresAt?.toISOString() || null,
      })
      .select()
      .single()

    if (insertError) {
      // Clean up uploaded file if database insert fails
      try {
        await provider.delete(uploadResult.path)
      } catch {
        logger.warn(`[Scheduled Backup] User ${userId}: Could not clean up file after DB error`)
      }
      throw new Error(`Failed to save backup metadata: ${insertError.message}`)
    }

    return { id: backup.id, filename: backup.filename }
  } finally {
    clearTimeout(timeoutId)
  }
}
