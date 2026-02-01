import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isBackupDue, isVercelCronRequest } from '../../lib/scheduler'
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

/**
 * Scheduled backup endpoint.
 * Called by Vercel Cron every hour (or manually for testing).
 * Checks if it's time for a backup based on user's timezone.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron (in production)
    if (process.env.VERCEL === '1' && !isVercelCronRequest(request.headers)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const results: { userId: string; status: string; error?: string }[] = []

    // Get all users with backup-manager enabled
    const { data: allSettings, error: settingsError } = await supabase
      .from('module_settings')
      .select('user_id, settings')
      .eq('module_id', MODULE_ID)

    if (settingsError) {
      throw settingsError
    }

    if (!allSettings || allSettings.length === 0) {
      return NextResponse.json({
        message: 'No users with backup settings found',
        processed: 0,
      })
    }

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

      try {
        // Create backup for this user
        // Note: In a real implementation, you'd need to call the backup export
        // with the user's credentials. For now, we'll skip this as it requires
        // more complex user impersonation.
        results.push({
          userId,
          status: 'scheduled',
          error: 'Backup scheduled (requires user session)',
        })
      } catch (backupError) {
        results.push({
          userId,
          status: 'error',
          error: backupError instanceof Error ? backupError.message : 'Unknown error',
        })
      }
    }

    const processed = results.filter((r) => r.status === 'success').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Backup check complete: ${processed} created, ${skipped} skipped, ${errors} errors`,
      processed,
      skipped,
      errors,
      results,
    })
  } catch (error) {
    console.error('Scheduled backup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scheduled backup failed' },
      { status: 500 }
    )
  }
}
