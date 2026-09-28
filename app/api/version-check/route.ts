import { NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { UPDATE_CHECK_MODULE_ID } from '@/lib/constants'
import { MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'
import { stripBuildMetadata, isNewerVersion, parseSemver } from '@/lib/version-compare'
import { VersionCheckIgnoreResponseSchema, VersionCheckResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

registry.registerPath({
  method: 'get',
  path: '/api/version-check',
  operationId: 'getVersionCheck',
  summary: 'Check whether a newer ARI version is available (one upstream check per user per 4 days; silent for 4 days after the user ignores the notice)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Update availability', content: { 'application/json': { schema: VersionCheckResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/version-check',
  operationId: 'ignoreVersionCheck',
  summary: 'Ignore the update notice — silences it for the current user for 4 days',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Notice ignored', content: { 'application/json': { schema: VersionCheckIgnoreResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Failed to save', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

// Shared by both gates: how long an upstream answer is reused, and how long
// the notice stays silent after the user clicks Ignore.
const CHECK_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000 // 4 days

function gatedResponse(currentVersion: string) {
  return NextResponse.json({
    updateAvailable: false,
    currentVersion,
    latestVersion: null,
  })
}

type UpdateCheckState = {
  lastCheckedAt: number
  ignoredAt: number
  latestVersion: string | null
}

function parseStamp(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : NaN
}

function isWithinInterval(stamp: number): boolean {
  return Number.isFinite(stamp) && Date.now() - stamp < CHECK_INTERVAL_MS
}

// Only trust a well-formed release version — a malformed or improper value
// (from the upstream or a stored row) must never reach the comparison or the
// popup UI.
function validVersion(value: unknown): string | null {
  return typeof value === 'string' && parseSemver(value) !== null ? value : null
}

async function readState(userId: string): Promise<UpdateCheckState> {
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
  return {
    lastCheckedAt: parseStamp(settings.lastCheckedAt),
    ignoredAt: parseStamp(settings.ignoredAt),
    latestVersion: validVersion(settings.latestVersion),
  }
}

/** Atomic JSONB merge — same race-safe upsert pattern as the api-keys route. */
async function mergeState(userId: string, patch: Record<string, string | null>) {
  const now = new Date().toISOString()
  await withAdminDb(async (db) =>
    db.insert(moduleSettings)
      .values({
        userId,
        moduleId: UPDATE_CHECK_MODULE_ID,
        enabled: true,
        settings: patch,
      })
      .onConflictDoUpdate({
        target: [moduleSettings.userId, moduleSettings.moduleId],
        set: {
          settings: sql`COALESCE(${moduleSettings.settings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
          updatedAt: now,
        },
      })
  )
}

function updateResponse(currentVersion: string, latest: string | null) {
  return NextResponse.json({
    updateAvailable:
      latest !== null &&
      isNewerVersion(stripBuildMetadata(latest), currentVersion),
    currentVersion,
    latestVersion: latest,
  })
}

async function handleGET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentVersion = stripBuildMetadata(
    process.env.NEXT_PUBLIC_ARI_VERSION || '0.0.0'
  )

  try {
    const state = await readState(user.id)

    // The user clicked Ignore — stay silent until the window passes.
    if (isWithinInterval(state.ignoredAt)) {
      return gatedResponse(currentVersion)
    }

    // Not ignored: keep answering from the stored upstream result so the
    // notice shows on every dashboard visit without another upstream call.
    if (isWithinInterval(state.lastCheckedAt) && state.latestVersion !== null) {
      return updateResponse(currentVersion, state.latestVersion)
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
    const latest = validVersion(data.latest_version)

    await mergeState(user.id, {
      lastCheckedAt: new Date().toISOString(),
      latestVersion: latest,
    })

    return updateResponse(currentVersion, latest)
  } catch (error) {
    console.error('[API /version-check] Error:', error)
    return gatedResponse(currentVersion)
  }
}

async function handlePOST() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await mergeState(user.id, { ignoredAt: new Date().toISOString() })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /version-check] Failed to ignore notice:', error)
    return NextResponse.json({ error: 'Failed to ignore update notice' }, { status: 500 })
  }
}

export const GET = withApiLogging(handleGET)
export const POST = withApiLogging(handlePOST)
