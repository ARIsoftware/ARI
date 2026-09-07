import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { requireAdminIfUsersExist } from '@/lib/auth-helpers'
import {
  checkRateLimit,
  getClientIp,
  isSameOriginRequest,
} from '@/lib/modules/public-route-security'
import { vercelConfigureRequestSchema, flattenZodErrors } from '@/lib/validation'
import { isVercel, getVercelInfo } from '@/lib/deployment'
import {
  buildVercelEnvPlan,
  listEnvKeys,
  resolveProject,
  triggerRedeploy,
  upsertEnvVars,
  verifyToken,
  VercelApiError,
} from '@/lib/vercel/api'
import { isSetupComplete } from '@/lib/env-registry'
import { classifyBootstrapError } from '@/lib/setup-error-dictionary'
import { getPgCode } from '@/lib/db/postgres-error'
import { VercelConfigureSuccessSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { ErrorResponseSchema } from '@/lib/openapi/common'

// Public during setup — guarded below by the user-count check, rate limit, and
// same-origin gate, exactly like /api/download-env (its local counterpart).
export const isPublic = true

registry.registerPath({
  method: 'post',
  path: '/api/setup/vercel-configure',
  operationId: 'vercelConfigure',
  summary:
    'Vercel branch of the /welcome wizard: writes env vars to the Vercel project via the REST API and triggers a production redeploy. Public during setup; admin-gated once a user exists.',
  description:
    'The Vercel access token in the request body is used for this one request and never stored, logged, or returned.',
  tags: ['app'],
  responses: {
    200: {
      description: 'Env vars saved and redeploy triggered',
      content: { 'application/json': { schema: VercelConfigureSuccessSchema } },
    },
    400: {
      description: 'Invalid input, DB unreachable, or not a Vercel deployment',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Cross-origin rejected',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Rate limit exceeded',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    502: {
      description: 'Vercel API failure',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

// Pre-flight the connection string before anything is written to Vercel, so a
// typo'd DATABASE_URL fails here instead of after a redeploy. One-off client;
// ssl handling mirrors lib/db/pool.ts.
async function testDatabaseConnection(databaseUrl: string): Promise<string | null> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 8000,
    ssl:
      databaseUrl.includes('127.0.0.1') || databaseUrl.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
  })
  try {
    await client.connect()
    await client.query('SELECT 1')
    return null
  } catch (error) {
    const explanation = classifyBootstrapError(
      undefined,
      error instanceof Error ? error.message : String(error),
      getPgCode(error),
    )
    return `${explanation.title}. ${explanation.summary}`
  } finally {
    try {
      await client.end()
    } catch {
      /* connection never opened */
    }
  }
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`vercel-configure:${getClientIp(request)}`, 3)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 },
    )
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 })
  }

  const denied = await requireAdminIfUsersExist(request.headers)
  if (denied) return denied

  if (!isVercel()) {
    return NextResponse.json(
      {
        error:
          'This endpoint only runs on Vercel deployments. Local installs save .env.local instead.',
      },
      { status: 400 },
    )
  }

  // Setup-only endpoint: once this deployment has its required config, any
  // resubmission (e.g. an admin revisiting /welcome) must not rewrite env vars
  // or trigger redeploys. Reconfiguration happens in the Vercel dashboard.
  if (isSetupComplete()) {
    return NextResponse.json(
      {
        error: 'ARI is already configured. Manage environment variables in your Vercel dashboard.',
      },
      { status: 400 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = vercelConfigureRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: flattenZodErrors(parsed.error) },
      { status: 400 },
    )
  }

  const { vercelToken, adminEmail, adminPassword } = parsed.data

  const info = getVercelInfo()
  if (!info?.projectId || !info.productionUrl) {
    return NextResponse.json(
      {
        error:
          'Vercel system environment variables are unavailable. Enable "Automatically expose System Environment Variables" in your Vercel project settings, redeploy, then try again.',
      },
      { status: 400 },
    )
  }

  try {
    // Token auth comes FIRST: everything below (including the outbound DB
    // connection test) must only run for a caller holding a valid Vercel token
    // with access to this project — otherwise this public-during-setup route
    // would be an SSRF/port-scan oracle for arbitrary databaseUrl values.
    if (!(await verifyToken(vercelToken))) {
      return NextResponse.json(
        {
          error:
            'Vercel rejected the access token. Create a new token at vercel.com/account/tokens and try again.',
        },
        { status: 400 },
      )
    }
    const project = await resolveProject(vercelToken, info.projectId)

    // Presence is checked against the PROJECT's stored env vars (the source of
    // truth), not this lambda's process.env — the old deployment's env is stale
    // during setup. An existing BETTER_AUTH_SECRET is never overwritten:
    // rotating it bricks every stored API key (lib/crypto.ts).
    const existingKeys = await listEnvKeys(vercelToken, project)
    const hasStoredSecret =
      existingKeys.has('BETTER_AUTH_SECRET') || !!process.env.BETTER_AUTH_SECRET
    const betterAuthSecret = hasStoredSecret ? undefined : parsed.data.betterAuthSecret
    if (!hasStoredSecret && !betterAuthSecret) {
      return NextResponse.json({ error: 'BETTER_AUTH_SECRET is required' }, { status: 400 })
    }
    const hasStoredDbUrl = existingKeys.has('DATABASE_URL') || !!process.env.DATABASE_URL
    if (!parsed.data.databaseUrl && !hasStoredDbUrl) {
      return NextResponse.json({ error: 'DATABASE_URL is required' }, { status: 400 })
    }

    // Pre-check whichever connection string we can actually see. A stored
    // sensitive DATABASE_URL is write-only — nothing to test in that case.
    const testableDbUrl = parsed.data.databaseUrl || process.env.DATABASE_URL
    if (testableDbUrl) {
      const dbError = await testDatabaseConnection(testableDbUrl)
      if (dbError) {
        return NextResponse.json(
          { error: `Database connection failed — nothing was saved. ${dbError}` },
          { status: 400 },
        )
      }
    }

    const plan = buildVercelEnvPlan(
      {
        databaseUrl: parsed.data.databaseUrl,
        betterAuthSecret,
        adminEmail,
        adminPassword,
        productionUrl: info.productionUrl,
      },
      existingKeys,
    )
    await upsertEnvVars(vercelToken, project, plan)
    const deployment = await triggerRedeploy(vercelToken, project, info)

    return NextResponse.json({
      success: true,
      productionUrl: info.productionUrl,
      deploymentId: deployment.deploymentId,
    })
  } catch (error) {
    // VercelApiError messages carry only Vercel's response detail — never the
    // request (and never the token). Anything else stays generic over the wire.
    if (error instanceof VercelApiError) {
      const status = error.status >= 400 && error.status < 500 ? 400 : 502
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error(
      'Vercel configure failed:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return NextResponse.json(
      { error: 'Unexpected error while configuring Vercel. Please try again.' },
      { status: 500 },
    )
  }
}
