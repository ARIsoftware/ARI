import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentTarget } from '@/lib/deployment'
import { getMissingRequiredConfig, isSetupComplete } from '@/lib/env-registry'
import { getDbMode } from '@/lib/db/mode'
import { checkRateLimit, getClientIp } from '@/lib/modules/public-route-security'
import { SetupStatusSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { ErrorResponseSchema } from '@/lib/openapi/common'

// Public: the /welcome wizard needs this before any user exists, and the
// post-configure deployment poll runs unauthenticated. Exposes no secrets —
// booleans plus required-var NAMES, and detail only while setup is incomplete.
export const isPublic = true
// The poll must always see the current deployment's env, never a cached body.
export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'get',
  path: '/api/setup/status',
  operationId: 'getSetupStatus',
  summary:
    'Setup state for the /welcome wizard — deployment target, DB mode, and missing required config',
  tags: ['app'],
  responses: {
    200: {
      description: 'Setup status',
      content: { 'application/json': { schema: SetupStatusSchema } },
    },
    429: {
      description: 'Rate limit exceeded',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export async function GET(request: NextRequest) {
  if (!checkRateLimit(`setup-status:${getClientIp(request)}`, 30)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 },
    )
  }

  const deploymentTarget = getDeploymentTarget()
  // dbMode is always included (it's not sensitive, and the wizard needs it to
  // pick the right step order even for a signed-in admin revisiting /welcome);
  // missing/projectDir stay setup-only.
  const body = isSetupComplete()
    ? { setupComplete: true, deploymentTarget, dbMode: getDbMode() }
    : {
        setupComplete: false,
        deploymentTarget,
        dbMode: getDbMode(),
        missing: getMissingRequiredConfig(),
        // Filesystem paths are only meaningful (and only safe to reveal) on
        // local installs, where the wizard shows where .env.local will land.
        ...(deploymentTarget === 'local' ? { projectDir: process.cwd() } : {}),
      }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
