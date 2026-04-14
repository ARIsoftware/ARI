import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { LICENSE_MODULE_ID } from '@/lib/license-helpers'

/**
 * Get the active license key for a user.
 * Checks DB first, then falls back to ARI_LICENSE_KEY env var.
 *
 * Server-only — uses the PG pool via Drizzle.
 */
export async function getLicenseKey(userId: string): Promise<string | null> {
  const rows = await withAdminDb(async (db) =>
    db.select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(
        and(
          eq(moduleSettings.userId, userId),
          eq(moduleSettings.moduleId, LICENSE_MODULE_ID)
        )
      )
  )

  const settings = rows[0]?.settings as Record<string, any> | null
  if (settings?.key) return settings.key

  return process.env.ARI_LICENSE_KEY || null
}
