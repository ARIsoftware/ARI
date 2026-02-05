import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { getStorageProvider } from '../../../lib/providers'
import type { BackupManagerSettings, BackupMetadata } from '../../../types'
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

// Download timeout (2 minutes)
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Validate UUID format
    if (!id || !UUID_REGEX.test(id)) {
      logger.warn(`[Backup Download] Invalid backup ID format: ${id}`)
      return NextResponse.json(
        { error: 'Invalid backup ID format' },
        { status: 400 }
      )
    }

    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info(`[Backup Download] User ${user.id} downloading backup ${id}`)

    const supabase = getServiceSupabase()

    // Get backup metadata
    const { data: backup, error: fetchError } = await supabase
      .from('backup_metadata')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !backup) {
      logger.warn(`[Backup Download] Backup not found: ${id}`)
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

    // Download from storage provider with timeout
    logger.info(`[Backup Download] Downloading from ${backup.storage_provider}: ${backup.storage_path}`)
    const provider = getStorageProvider(backup.storage_provider, settings)

    let content: string
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Download timeout exceeded')), DOWNLOAD_TIMEOUT_MS)
      )

      content = await Promise.race([
        provider.download(backup.storage_path),
        timeoutPromise,
      ])
    } catch (downloadError: any) {
      if (downloadError.message === 'Download timeout exceeded') {
        logger.error(`[Backup Download] Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`)
        return NextResponse.json(
          { error: 'Download timed out' },
          { status: 504 }
        )
      }
      throw downloadError
    }

    logger.info(`[Backup Download] Downloaded ${content.length} bytes`)

    // Verify checksum if available
    if (backup.checksum) {
      const hash = crypto.createHash('sha256')
      hash.update(content)
      const calculatedChecksum = hash.digest('hex')

      if (calculatedChecksum !== backup.checksum) {
        logger.error(
          `[Backup Download] Checksum mismatch! Expected: ${backup.checksum}, Got: ${calculatedChecksum}`
        )
        return NextResponse.json(
          {
            error: 'Backup file integrity check failed. The file may be corrupted.',
            expected: backup.checksum,
            actual: calculatedChecksum,
          },
          { status: 500 }
        )
      }

      logger.info(`[Backup Download] Checksum verified: ${calculatedChecksum.substring(0, 16)}...`)
    } else {
      logger.warn(`[Backup Download] No checksum stored, skipping verification`)
    }

    // Calculate content length
    const contentLength = Buffer.byteLength(content, 'utf8')

    logger.info(`[Backup Download] Sending ${backup.filename} (${contentLength} bytes)`)

    // Return as downloadable SQL file with all necessary headers
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
        'Content-Length': contentLength.toString(),
        'X-Backup-Checksum': backup.checksum || 'not-available',
        'X-Backup-Created': backup.created_at,
        'X-Backup-Tables': (backup.table_count || 0).toString(),
        'X-Backup-Rows': (backup.row_count || 0).toString(),
        // Prevent caching of backup files
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to download backup'
    logger.error(`[Backup Download] Error: ${errorMessage}`)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
