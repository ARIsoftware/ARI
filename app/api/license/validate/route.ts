import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createDbClient } from '@/lib/db-supabase'
import { LICENSE_MODULE_ID } from '@/lib/license-helpers'
import { z } from 'zod'
const POLAR_ORGANIZATION_ID = "b1e4ddc2-774b-4bfb-aedd-5ffb0f67e8e3"

const ValidateSchema = z.object({
  key: z.string().min(1, "License key is required"),
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
    const polarResponse = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        organization_id: POLAR_ORGANIZATION_ID,
      }),
    })

    if (!polarResponse.ok) {
      const errorText = await polarResponse.text()
      console.error('[API /license/validate] Polar API error:', polarResponse.status, errorText)
      return NextResponse.json(
        { error: 'Invalid license key' },
        { status: 400 }
      )
    }

    const polarData = await polarResponse.json()

    // Check if key is valid
    if (polarData.status !== 'granted' && polarData.status !== 'active') {
      return NextResponse.json(
        { error: `License key is ${polarData.status || 'invalid'}` },
        { status: 400 }
      )
    }

    // Store validated license in module_settings
    const supabase = createDbClient()
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

    const { error: upsertError } = await supabase
      .from('module_settings')
      .upsert(
        {
          user_id: user.id,
          module_id: LICENSE_MODULE_ID,
          enabled: true,
          settings: licenseData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,module_id' }
      )

    if (upsertError) {
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
