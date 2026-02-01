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

export async function DELETE(
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

    // Delete from storage provider
    try {
      const provider = getStorageProvider(backup.storage_provider, settings)
      await provider.delete(backup.storage_path)
    } catch (storageError) {
      console.warn('Failed to delete from storage (may already be deleted):', storageError)
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('backup_metadata')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete backup:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete backup' },
      { status: 500 }
    )
  }
}
