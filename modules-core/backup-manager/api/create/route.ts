import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { getStorageProvider } from '../../lib/providers'
import { calculateExpirationDate } from '../../lib/retention'
import type { BackupManagerSettings } from '../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../types'
import crypto from 'crypto'

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
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Call the existing backup export endpoint to get the SQL content
    const exportResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/backup/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward auth headers - use internal service auth
      },
    })

    if (!exportResponse.ok) {
      const error = await exportResponse.json().catch(() => ({}))
      throw new Error(error.error || 'Failed to create backup export')
    }

    const sqlContent = await exportResponse.text()

    // Parse metadata from the export
    const metadataMatch = sqlContent.match(/-- ({.*})/)
    let tableCount = 0
    let rowCount = 0
    let checksum = ''

    if (metadataMatch) {
      try {
        const metadata = JSON.parse(metadataMatch[1])
        tableCount = metadata.tables?.length || 0
        rowCount = metadata.totalRows || 0
      } catch {
        // Ignore parse errors
      }
    }

    // Calculate checksum
    const hash = crypto.createHash('sha256')
    hash.update(sqlContent)
    checksum = hash.digest('hex')

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup-${timestamp}.sql`

    // Upload to storage provider
    const provider = getStorageProvider(settings.storageProvider, settings)
    const { path, size } = await provider.upload(filename, sqlContent)

    // Calculate expiration date
    const createdAt = new Date()
    const expiresAt = calculateExpirationDate(createdAt, settings.retentionDays)

    // Save metadata to database
    const supabase = getServiceSupabase()
    const { data: backup, error: insertError } = await supabase
      .from('backup_metadata')
      .insert({
        user_id: user.id,
        filename,
        storage_provider: settings.storageProvider,
        storage_path: path,
        size_bytes: size,
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
        await provider.delete(path)
      } catch {
        // Ignore cleanup errors
      }
      throw insertError
    }

    // Update lastBackupAt in settings
    await withRLS((db) =>
      db.update(moduleSettings)
        .set({
          settings: { ...settings, lastBackupAt: createdAt.toISOString() } as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(moduleSettings.moduleId, MODULE_ID))
    )

    return NextResponse.json(backup)
  } catch (error) {
    console.error('Failed to create backup:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create backup' },
      { status: 500 }
    )
  }
}
