import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { MODULES_API_BASE, buildClientInfo } from '@/lib/license-helpers'
import { getLicenseKey } from '@/lib/license-helpers-server'
import { ModuleLibraryResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/library',
  operationId: 'getModuleLibrary',
  summary: 'Proxy to the central ARI module library (lists installable modules)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Module library response from upstream', content: { 'application/json': { schema: ModuleLibraryResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

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
      const upstreamError = errorData.error
      const errorPayload = upstreamError?.code
        ? { code: upstreamError.code, message: upstreamError.message ?? 'Failed to fetch module library' }
        : { message: upstreamError?.message ?? 'Failed to fetch module library' }
      return NextResponse.json(
        { error: errorPayload },
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
