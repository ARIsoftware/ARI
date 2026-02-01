import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { eq } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import type { BackupManagerSettings } from '../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../types'

const MODULE_ID = 'backup-manager'

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get settings from module_settings table
    const settings = await withRLS((db) =>
      db.select()
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1)
    )

    if (settings.length === 0) {
      // Return default settings if none exist
      return NextResponse.json(DEFAULT_BACKUP_SETTINGS)
    }

    // Parse settings from JSONB field
    const storedSettings = settings[0].settings as BackupManagerSettings | null
    const mergedSettings = {
      ...DEFAULT_BACKUP_SETTINGS,
      ...storedSettings,
    }

    return NextResponse.json(mergedSettings)
  } catch (error) {
    console.error('Failed to fetch backup settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch backup settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate the settings
    if (body.storageProvider && !['supabase', 'r2', 's3'].includes(body.storageProvider)) {
      return NextResponse.json(
        { error: 'Invalid storage provider' },
        { status: 400 }
      )
    }

    if (body.retentionDays !== undefined && ![0, 7, 14, 30, 60, 90].includes(body.retentionDays)) {
      return NextResponse.json(
        { error: 'Invalid retention period' },
        { status: 400 }
      )
    }

    // Get existing settings
    const existingSettings = await withRLS((db) =>
      db.select()
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, MODULE_ID))
        .limit(1)
    )

    const currentSettings = existingSettings.length > 0
      ? (existingSettings[0].settings as BackupManagerSettings | null) || DEFAULT_BACKUP_SETTINGS
      : DEFAULT_BACKUP_SETTINGS

    // Merge with new settings
    const updatedSettings: BackupManagerSettings = {
      ...currentSettings,
      ...body,
    }

    if (existingSettings.length === 0) {
      // Insert new settings
      await withRLS((db) =>
        db.insert(moduleSettings).values({
          userId: user.id as unknown as ReturnType<typeof crypto.randomUUID>,
          moduleId: MODULE_ID,
          enabled: true,
          settings: updatedSettings as unknown as Record<string, unknown>,
        })
      )
    } else {
      // Update existing settings
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: updatedSettings as unknown as Record<string, unknown>,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(moduleSettings.moduleId, MODULE_ID))
      )
    }

    return NextResponse.json(updatedSettings)
  } catch (error) {
    console.error('Failed to save backup settings:', error)
    return NextResponse.json(
      { error: 'Failed to save backup settings' },
      { status: 500 }
    )
  }
}
