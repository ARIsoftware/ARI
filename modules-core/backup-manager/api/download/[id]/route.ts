import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { getStorageProvider } from '../../../lib/providers'
import type { BackupManagerSettings, BackupMetadata } from '../../../types'
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

export async function GET(
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

    // Download from storage provider
    const provider = getStorageProvider(backup.storage_provider, settings)
    const content = await provider.download(backup.storage_path)

    // Return as downloadable SQL file
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
      },
    })
  } catch (error) {
    console.error('Failed to download backup:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download backup' },
      { status: 500 }
    )
  }
}
