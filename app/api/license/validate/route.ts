import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { withAdminDb } from '@/lib/db'
import { moduleSettings } from '@/lib/db/schema'
import { LICENSE_MODULE_ID } from '@/lib/license-helpers'
import { validateLicenseSchema as ValidateSchema, ValidateLicenseResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

const POLAR_ORGANIZATION_ID = "b1e4ddc2-774b-4bfb-aedd-5ffb0f67e8e3"

registry.registerPath({
  method: 'post',
  path: '/api/license/validate',
  operationId: 'validateLicense',
  summary: 'Validate a license key against the Polar API and store the result',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: ValidateSchema } } } },
  responses: {
    200: { description: 'Valid license — stored', content: { 'application/json': { schema: ValidateLicenseResponseSchema } } },
    400: { description: 'Invalid license key', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'Rate limited by upstream Polar API', content: { 'application/json': { schema: ErrorResponseSchema } } },
    503: { description: 'License service unavailable', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parseResult = ValidateSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error },
        { status: 400 }
      )
    }

    const { key } = parseResult.data
    // Validate against Polar API
    let polarResponse: Response
    try {
      polarResponse = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          organization_id: POLAR_ORGANIZATION_ID,
        }),
      })
    } catch (fetchError) {
      console.error('[API /license/validate] Polar fetch failed:', fetchError)
      return NextResponse.json(
        { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'License validation service unavailable' } },
        { status: 503 }
      )
    }

    if (!polarResponse.ok) {
      const errorText = await polarResponse.text()
      console.error('[API /license/validate] Polar API error:', polarResponse.status, errorText)

      if (polarResponse.status >= 500) {
        return NextResponse.json(
          { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'License validation service unavailable' } },
          { status: 503 }
        )
      }
      if (polarResponse.status === 429) {
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many validation attempts' } },
          { status: 429 }
        )
      }
      // 4xx from Polar (404, 422, etc.) means the key itself is bad — not an outage.
      return NextResponse.json(
        { error: { code: 'LICENSE_INVALID', message: 'License key is invalid' } },
        { status: 400 }
      )
    }

    const polarData = await polarResponse.json()

    // Check if key is valid
    if (polarData.status !== 'granted' && polarData.status !== 'active') {
      return NextResponse.json(
        { error: { code: 'LICENSE_INVALID', message: `License key is ${polarData.status || 'invalid'}` } },
        { status: 400 }
      )
    }

    // Store validated license in module_settings
    const licenseData = {
      key,
      status: polarData.status,
      validated_at: new Date().toISOString(),
      customer_email: polarData.customer?.email || null,
      customer_name: polarData.customer?.name || null,
      expires_at: polarData.expires_at || null,
      benefit_id: polarData.benefit_id || null,
      license_key_id: polarData.id || null,
    }

    try {
      await withAdminDb(async (db) => {
        await db.insert(moduleSettings)
          .values({
            userId: user.id,
            moduleId: LICENSE_MODULE_ID,
            enabled: true,
            settings: licenseData,
          })
          .onConflictDoUpdate({
            target: [moduleSettings.userId, moduleSettings.moduleId],
            set: {
              settings: licenseData,
              updatedAt: new Date().toISOString(),
            },
          })
      })
    } catch (upsertError) {
      console.error('[API /license/validate] Failed to store license:', upsertError)
      return NextResponse.json(
        { error: 'Failed to store license data' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      status: polarData.status,
      customer_email: licenseData.customer_email,
      expires_at: licenseData.expires_at,
    })
  } catch (error) {
    console.error('[API /license/validate] Error:', error)
    return NextResponse.json(
      { error: 'Failed to validate license key' },
      { status: 500 }
    )
  }
}
