import { NextRequest, NextResponse } from 'next/server'
import { access, rename, writeFile } from 'fs/promises'
import path from 'path'
import { checkRateLimit, getClientIp, isSameOriginRequest } from '@/lib/modules/public-route-security'
import { requireAuthIfUsersExist } from '@/lib/auth-helpers'
import { welcomeEnvSaveRequestSchema, flattenZodErrors } from '@/lib/validation'
import { renderEnvFile } from '@/lib/env-file'
import { SaveEnvSuccessSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

export const debugRole = "onboarding-save-env"
// Public during setup — guarded below by user-count check
export const isPublic = true

registry.registerPath({
  method: 'post',
  path: '/api/onboarding/save-env',
  operationId: 'onboardingSaveEnv',
  summary: 'Save .env.local from the onboarding flow (rate-limited, same-origin required)',
  tags: ['app'],
  responses: {
    200: { description: 'Wrote .env.local successfully', content: { 'application/json': { schema: SaveEnvSuccessSchema } } },
    400: { description: 'Invalid input', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Cross-origin rejected', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'Rate limit exceeded', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`save-env:${getClientIp(request)}`, 3)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    )
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: 'Cross-origin request rejected' },
      { status: 403 }
    )
  }

  const denied = await requireAuthIfUsersExist(request.headers)
  if (denied) return denied

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = welcomeEnvSaveRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: flattenZodErrors(parsed.error) },
        { status: 400 }
      )
    }

    const { localSupabaseDetected: _, dbMode, ...fields } = parsed.data
    const content = renderEnvFile(fields, { dbMode })

    const envPath = path.join(process.cwd(), '.env.local')

    try {
      await access(envPath)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(process.cwd(), `.env.local.${timestamp}`)
      await rename(envPath, backupPath)
    } catch {
      // No existing file to back up
    }

    await writeFile(envPath, content, 'utf-8')

    return NextResponse.json({ success: true, path: envPath })
  } catch (error: unknown) {
    console.error('[Save Env] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save .env.local', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
