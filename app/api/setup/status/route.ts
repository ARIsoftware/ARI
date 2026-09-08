import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentTarget } from '@/lib/deployment'
import { getMissingRequiredConfig, isSetupComplete } from '@/lib/env-registry'
import { getDbMode } from '@/lib/db/mode'
import { checkUsersExistInDb, getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkRateLimit, getClientIp } from '@/lib/modules/public-route-security'
import { withApiLogging } from '@/lib/api-logging'
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

async function handleGET(request: NextRequest) {
  if (!checkRateLimit(`setup-status:${getClientIp(request)}`, 30)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 },
    )
  }

  const deploymentTarget = getDeploymentTarget()
  const setupComplete = isSetupComplete()

  // Detail gate. checkUsersExistInDb queries the user table DIRECTLY (no
  // isSetupComplete short-circuit — that shortcut would report no-env for an
  // established install whose env broke, silently reopening the disclosure):
  //  - no-users / no-table / no-pool: nobody CAN authenticate → genuine
  //    first-run window, the wizard gets the detail it needs.
  //  - has-users: admin only. In setup mode getAuthenticatedUser returns
  //    NULL_AUTH, so an established install that re-entered setup mode
  //    (botched .env.local edit) discloses nothing to anonymous callers.
  //  - db-error: fail closed.
  // Denied callers still get the base fields; the cross-deployment poll only
  // needs setupComplete.
  const usersState = (await checkUsersExistInDb()).status
  let canSeeDetail = false
  if (usersState === 'no-users' || usersState === 'no-table' || usersState === 'no-pool') {
    canSeeDetail = true
  } else if (usersState === 'has-users') {
    const { user } = await getAuthenticatedUser()
    canSeeDetail = user?.role === 'admin'
  }

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

export const GET = withApiLogging(handleGET)
