import { NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { UPDATE_CHECK_MODULE_ID } from '@/lib/constants'
import { MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'
import { stripBuildMetadata, isNewerVersion, parseSemver } from '@/lib/version-compare'
import { VersionCheckResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/version-check',
  operationId: 'getVersionCheck',
  summary: 'Check whether a newer ARI version is available (rate-limited to one upstream check per user per 4 days)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Update availability', content: { 'application/json': { schema: VersionCheckResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

const CHECK_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000 // 4 days

function gatedResponse(currentVersion: string) {
  return NextResponse.json({
    updateAvailable: false,
    currentVersion,
    latestVersion: null,
  })
}

async function readLastCheckedAt(userId: string): Promise<number> {
  const rows = await withAdminDb(async (db) =>
    db.select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(
        and(
          eq(moduleSettings.userId, userId),
          eq(moduleSettings.moduleId, UPDATE_CHECK_MODULE_ID)
        )
      )
  )
  const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>
  return typeof settings.lastCheckedAt === 'string'
    ? Date.parse(settings.lastCheckedAt)
    : NaN
}

/** Atomic JSONB merge — same race-safe upsert pattern as the api-keys route. */
async function stampLastCheckedAt(userId: string) {
  const patch = JSON.stringify({ lastCheckedAt: new Date().toISOString() })
  await withAdminDb(async (db) =>
    db.insert(moduleSettings)
      .values({
        userId,
        moduleId: UPDATE_CHECK_MODULE_ID,
        enabled: true,
        settings: { lastCheckedAt: new Date().toISOString() },
      })
      .onConflictDoUpdate({
        target: [moduleSettings.userId, moduleSettings.moduleId],
        set: {
          settings: sql`COALESCE(${moduleSettings.settings}, '{}'::jsonb) || ${patch}::jsonb`,
          updatedAt: new Date().toISOString(),
        },
      })
  )
}

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentVersion = stripBuildMetadata(
    process.env.NEXT_PUBLIC_ARI_VERSION || '0.0.0'
  )

  try {
    const lastCheckedAt = await readLastCheckedAt(user.id)
    if (
      Number.isFinite(lastCheckedAt) &&
      Date.now() - lastCheckedAt < CHECK_INTERVAL_MS
    ) {
      return gatedResponse(currentVersion)
    }

    const response = await fetch(`${MODULES_API_BASE}/version/latest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_info: buildClientInfo() }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      // Upstream unavailable — fail silent and don't stamp, so the next
      // dashboard visit retries instead of going quiet for 4 days.
      console.warn(`[API /version-check] Upstream responded ${response.status}`)
      return gatedResponse(currentVersion)
    }

    const data = (await response.json()) as { latest_version?: unknown }
    // Only trust a well-formed release version — a malformed or improper value
    // from the upstream must never reach the comparison or the popup UI.
    const latest =
      typeof data.latest_version === 'string' &&
      parseSemver(data.latest_version) !== null
        ? data.latest_version
        : null

    await stampLastCheckedAt(user.id)

    return NextResponse.json({
      updateAvailable:
        latest !== null &&
        isNewerVersion(stripBuildMetadata(latest), currentVersion),
      currentVersion,
      latestVersion: latest,
    })
  } catch (error) {
    console.error('[API /version-check] Error:', error)
    return gatedResponse(currentVersion)
  }
}
