import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { eq, and } from 'drizzle-orm'
import { moduleSettings } from '@/lib/db/schema/schema'
import { isProviderConfigured } from '../../lib/providers'
import type { BackupManagerSettings, StorageProvider } from '../../types'
import { DEFAULT_BACKUP_SETTINGS } from '../../types'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const MODULE_ID = 'backup-manager'

// Zod schema for settings validation
const settingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  storageProvider: z.enum(['supabase', 'r2', 's3']).optional(),
  retentionDays: z.enum([0, 7, 14, 30, 60, 90].map(n => n) as [number, ...number[]]).optional(),
  lastBackupAt: z.string().nullable().optional(),
  supabase: z.object({
    bucketName: z.string().min(1).max(63),
  }).optional(),
  r2: z.object({
    bucketName: z.string().min(1).max(63),
  }).optional(),
  s3: z.object({
    bucketName: z.string().min(1).max(63),
    region: z.string().min(1),
  }).optional(),
}).strict()

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
      const defaultWithProviderStatus = {
        ...DEFAULT_BACKUP_SETTINGS,
        providerConfigured: isProviderConfigured(DEFAULT_BACKUP_SETTINGS.storageProvider).configured,
      }
      return NextResponse.json(defaultWithProviderStatus)
    }

    // Parse settings from JSONB field
    const storedSettings = settings[0].settings as BackupManagerSettings | null
    const mergedSettings = {
      ...DEFAULT_BACKUP_SETTINGS,
      ...storedSettings,
    }

    // Add provider configuration status
    const providerStatus = isProviderConfigured(mergedSettings.storageProvider as StorageProvider)
    const response = {
      ...mergedSettings,
      providerConfigured: providerStatus.configured,
      providerMissing: providerStatus.configured ? undefined : providerStatus.missing,
    }

    return NextResponse.json(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch backup settings'
    logger.error(`[Backup Settings] GET error: ${errorMessage}`)
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

    // Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    // Validate with Zod
    const parseResult = settingsUpdateSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      logger.warn(`[Backup Settings] Validation failed: ${errors.join(', ')}`)
      return NextResponse.json(
        { error: 'Invalid settings', details: errors },
        { status: 400 }
      )
    }

    const validatedBody = parseResult.data

    // If changing storage provider, validate it's configured
    if (validatedBody.storageProvider) {
      const providerConfig = isProviderConfigured(validatedBody.storageProvider as StorageProvider)
      if (!providerConfig.configured) {
        logger.warn(`[Backup Settings] Provider not configured: ${validatedBody.storageProvider}`)
        return NextResponse.json(
          {
            error: `Storage provider '${validatedBody.storageProvider}' is not configured`,
            missing: providerConfig.missing,
          },
          { status: 400 }
        )
      }
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
      ...validatedBody,
    }

    logger.info(`[Backup Settings] User ${user.id} updating settings: provider=${updatedSettings.storageProvider}, enabled=${updatedSettings.enabled}`)

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
      // Update existing settings - use both userId and moduleId to ensure we update the right row
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: updatedSettings as unknown as Record<string, unknown>,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(moduleSettings.moduleId, MODULE_ID),
              eq(moduleSettings.userId, existingSettings[0].userId)
            )
          )
      )
    }

    // Return updated settings with provider status
    const providerStatus = isProviderConfigured(updatedSettings.storageProvider as StorageProvider)
    const response = {
      ...updatedSettings,
      providerConfigured: providerStatus.configured,
      providerMissing: providerStatus.configured ? undefined : providerStatus.missing,
    }

    return NextResponse.json(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to save backup settings'
    logger.error(`[Backup Settings] PUT error: ${errorMessage}`)
    return NextResponse.json(
      { error: 'Failed to save backup settings' },
      { status: 500 }
    )
  }
}
