import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { LICENSE_MODULE_ID } from '@/lib/license-helpers'
import { z } from 'zod'

const licenseSettingsSchema = z.object({
  key: z.string(),
  status: z.string().nullish(),
  customer_email: z.string().nullish(),
  expires_at: z.string().nullish(),
  validated_at: z.string().nullish(),
})

function maskKey(key: string): string {
  if (key.length <= 18) return '*'.repeat(key.length)
  return key.slice(0, -18) + '*'.repeat(18)
}

export async function GET() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await withAdminDb(async (db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(
          and(
            eq(moduleSettings.userId, user.id),
            eq(moduleSettings.moduleId, LICENSE_MODULE_ID)
          )
        )
    )

    const data = rows[0]
    const parsed = licenseSettingsSchema.safeParse(data?.settings)
    if (!parsed.success) {
      // If no valid DB license, check for env var license key
      const envKey = process.env.ARI_LICENSE_KEY
      return NextResponse.json({ active: false, ...(envKey ? { env_key: envKey } : {}) })
    }

    const settings = parsed.data
    return NextResponse.json({
      active: true,
      status: settings.status ?? null,
      masked_key: maskKey(settings.key),
      customer_email: settings.customer_email ?? null,
      expires_at: settings.expires_at ?? null,
      validated_at: settings.validated_at ?? null,
    })
  } catch (error) {
    console.error('[API /license/status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check license status' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await withAdminDb(async (db) => {
      await db.delete(moduleSettings)
        .where(
          and(
            eq(moduleSettings.userId, user.id),
            eq(moduleSettings.moduleId, LICENSE_MODULE_ID)
          )
        )
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /license/status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate license' },
      { status: 500 }
    )
  }
}
