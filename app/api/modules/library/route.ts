import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getLicenseKey, MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const licenseKey = await getLicenseKey(user.id)

    const body: { client_info: ReturnType<typeof buildClientInfo>; license_key?: string } = {
      client_info: buildClientInfo(),
    }

    if (licenseKey) {
      body.license_key = licenseKey
    }

    const response = await fetch(`${MODULES_API_BASE}/modules/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to fetch module library' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[API /modules/library] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch module library' },
      { status: 500 }
    )
  }
}
