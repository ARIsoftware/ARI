import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { getSchedulingMode, getNextBackupTime } from '../../lib/scheduler'
import type { BackupManagerSettings, SchedulingStatus } from '../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../types'

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

export async function GET() {
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

    // Get user timezone from user_preferences
    const supabase = getServiceSupabase()
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('timezone')
      .eq('user_id', user.id)
      .single()

    const timezone = prefs?.timezone || 'UTC'

    // Determine scheduling mode
    const schedulingMode = getSchedulingMode()

    // Calculate next backup time
    const nextBackupTime = getNextBackupTime(settings.lastBackupAt, timezone)

    const status: SchedulingStatus = {
      schedulingMode,
      scheduledTime: `12:00 PM ${timezone}`,
      limitation: schedulingMode === 'app-triggered'
        ? 'Backups only run when the app is accessed'
        : null,
      lastBackupAt: settings.lastBackupAt,
      nextBackupAt: settings.enabled ? nextBackupTime.toISOString() : null,
    }

    return NextResponse.json(status)
  } catch (error) {
    console.error('Failed to get backup status:', error)
    return NextResponse.json(
      { error: 'Failed to get backup status' },
      { status: 500 }
    )
  }
}
