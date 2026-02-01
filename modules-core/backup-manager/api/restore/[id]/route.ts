import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { getStorageProvider } from '../../../lib/providers'
import type { BackupManagerSettings } from '../../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../../types'

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()

    // Get backup metadata
    const { data: backup, error: fetchError } = await supabase
      .from('backup_metadata')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !backup) {
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

    // Download the backup file
    const provider = getStorageProvider(backup.storage_provider, settings)
    const sqlContent = await provider.download(backup.storage_path)

    // Create a FormData object with the SQL content
    const formData = new FormData()
    const blob = new Blob([sqlContent], { type: 'application/sql' })
    formData.append('file', blob, backup.filename)

    // First, validate the backup
    const validateResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/backup/import`,
      {
        method: 'PUT',
        body: formData,
      }
    )

    if (!validateResponse.ok) {
      const error = await validateResponse.json().catch(() => ({}))
      throw new Error(error.error || 'Backup validation failed')
    }

    const validation = await validateResponse.json()
    if (!validation.valid) {
      throw new Error(`Invalid backup: ${validation.errors?.[0] || 'Unknown validation error'}`)
    }

    // Create a new FormData for the actual import
    const importFormData = new FormData()
    const importBlob = new Blob([sqlContent], { type: 'application/sql' })
    importFormData.append('file', importBlob, backup.filename)

    // Now perform the actual import
    const importResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/backup/import`,
      {
        method: 'POST',
        body: importFormData,
      }
    )

    if (!importResponse.ok) {
      const error = await importResponse.json().catch(() => ({}))
      throw new Error(error.error || 'Backup restore failed')
    }

    const result = await importResponse.json()

    return NextResponse.json({
      success: true,
      message: result.message || 'Backup restored successfully',
      stats: result.stats,
    })
  } catch (error) {
    console.error('Failed to restore backup:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore backup' },
      { status: 500 }
    )
  }
}
