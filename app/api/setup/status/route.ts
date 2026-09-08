import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentTarget } from '@/lib/deployment'
import { getMissingRequiredConfig, isSetupComplete } from '@/lib/env-registry'
import { getDbMode } from '@/lib/db/mode'
import { requireAdminIfUsersExist } from '@/lib/auth-helpers'
import { checkRateLimit, getClientIp } from '@/lib/modules/public-route-security'
import { SetupStatusSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { ErrorResponseSchema } from '@/lib/openapi/common'

// Public: the /welcome wizard needs this before any user exists, and the
// post-configure deployment poll runs unauthenticated. The base fields expose
// no secrets; the detail fields (missing-var names, projectDir) are additionally
// gated below — anonymous callers only see them while no user can authenticate.
export const isPublic = true
// Security contract for the /health public-endpoint tester: open by design.
// This is a rate-limited read that the wizard MUST reach unauthenticated before
// any user exists (and the cross-deployment poll runs anonymously), so a
// header-less 200 is in-contract — the per-IP rate limit is the guard, and the
// only detail fields are admin-gated above. Same contract as branding/login-logo.
export const publicSecurity = 'rate_limit_only'
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
  const setupComplete = isSetupComplete()

  // Detail gate: during genuine first-run setup nobody CAN authenticate
  // (no env / no users), so requireAdminIfUsersExist allows the wizard through.
  // Once users exist, missing-var names and the absolute project path are
  // admin-only — an established install that re-enters setup mode (e.g. a
  // botched .env.local edit) must not disclose them to anonymous callers.
  // Denied callers still get the base fields; the cross-deployment poll only
  // needs setupComplete.
  const canSeeDetail = (await requireAdminIfUsersExist(request.headers)) === null

  // dbMode is always included (it's not sensitive, and the wizard needs it to
  // pick the right step order even for a signed-in admin revisiting /welcome).
  // projectDir is included whenever the caller may see detail — a configured
  // install's Save step (admin regenerating .env.local) still needs the real
  // path, not a placeholder.
  const body = {
    setupComplete,
    deploymentTarget,
    dbMode: getDbMode(),
    ...(!setupComplete && canSeeDetail ? { missing: getMissingRequiredConfig() } : {}),
    // Filesystem paths are only meaningful (and only safe to reveal) on
    // local installs, where the wizard shows where .env.local will land.
    ...(deploymentTarget === 'local' && canSeeDetail ? { projectDir: process.cwd() } : {}),
  }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
