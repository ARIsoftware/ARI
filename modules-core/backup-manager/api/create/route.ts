import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
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

export async function POST() {
  try {
    logger.info('[Backup] Starting backup creation...')

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      logger.warn('[Backup] Unauthorized backup attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info(`[Backup] User ${user.id} initiating backup`)

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

    logger.info(`[Backup] Using storage provider: ${settings.storageProvider}`)

    // Validate storage provider is configured
    const providerConfig = isProviderConfigured(settings.storageProvider as StorageProvider)
    if (!providerConfig.configured) {
      const errorMsg = `Storage provider '${settings.storageProvider}' is not configured. Missing: ${providerConfig.missing.join(', ')}`
      logger.error(`[Backup] ${errorMsg}`)
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // Get cookies to forward to the export endpoint for authentication
    const cookieStore = await cookies()
    const cookieHeader = cookieStore.getAll()
      .map(c => `${c.name}=${c.value}`)
      .join('; ')

    // Determine the base URL for internal API calls
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    logger.info(`[Backup] Calling export endpoint at ${baseUrl}/api/backup/export`)

    // Call the existing backup export endpoint to get the SQL content
    const exportResponse = await fetch(`${baseUrl}/api/backup/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
    })

    if (!exportResponse.ok) {
      const errorText = await exportResponse.text()
      let errorMessage = 'Failed to create backup export'

      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error || errorMessage
      } catch {
        // Not JSON, use raw text if available
        if (errorText) {
          errorMessage = errorText.substring(0, 200)
        }
      }

      logger.error(`[Backup] Export endpoint failed (${exportResponse.status}): ${errorMessage}`)
      throw new Error(`Export failed: ${errorMessage}`)
    }

    const sqlContent = await exportResponse.text()
    logger.info(`[Backup] Export complete, got ${sqlContent.length} bytes`)

    // Validate we got actual SQL content
    if (!sqlContent || sqlContent.length < 100) {
      logger.error('[Backup] Export returned empty or invalid content')
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
        logger.info(`[Backup] Parsed metadata: ${tableCount} tables, ${rowCount} rows`)
      } catch {
        logger.warn('[Backup] Could not parse metadata from export')
      }
    }

    // Calculate checksum
    const hash = crypto.createHash('sha256')
    hash.update(sqlContent)
    const checksum = hash.digest('hex')
    logger.info(`[Backup] Checksum: ${checksum.substring(0, 16)}...`)

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup-${timestamp}.sql`

    // Upload to storage provider
    logger.info(`[Backup] Uploading ${filename} to ${settings.storageProvider}...`)
    const provider = getStorageProvider(settings.storageProvider as StorageProvider, settings)

    let uploadResult: { path: string; size: number }
    try {
      uploadResult = await provider.upload(filename, sqlContent)
      logger.info(`[Backup] Upload successful: ${uploadResult.path} (${uploadResult.size} bytes)`)
    } catch (uploadError) {
      const msg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
      logger.error(`[Backup] Upload failed: ${msg}`)
      throw new Error(`Failed to upload backup to ${settings.storageProvider}: ${msg}`)
    }

    // Calculate expiration date
    const createdAt = new Date()
    const expiresAt = calculateExpirationDate(createdAt, settings.retentionDays)

    // Save metadata to database
    logger.info('[Backup] Saving backup metadata to database...')
    const supabase = getServiceSupabase()
    const { data: backup, error: insertError } = await supabase
      .from('backup_metadata')
      .insert({
        user_id: user.id,
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
      logger.error(`[Backup] Database insert failed: ${insertError.message}`)
      // Clean up uploaded file if database insert fails
      try {
        await provider.delete(uploadResult.path)
        logger.info('[Backup] Cleaned up uploaded file after database error')
      } catch (cleanupError) {
        logger.warn('[Backup] Could not clean up uploaded file after database error')
      }
      throw new Error(`Failed to save backup metadata: ${insertError.message}`)
    }

    // Update lastBackupAt in settings
    try {
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: { ...settings, lastBackupAt: createdAt.toISOString() } as unknown as Record<string, unknown>,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(moduleSettings.moduleId, MODULE_ID))
      )
    } catch (settingsError) {
      // Non-fatal error - backup was still created
      logger.warn('[Backup] Could not update lastBackupAt in settings')
    }

    logger.info(`[Backup] Backup created successfully: ${backup.id}`)
    return NextResponse.json(backup)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create backup'
    logger.error(`[Backup] Backup creation failed: ${errorMessage}`)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
