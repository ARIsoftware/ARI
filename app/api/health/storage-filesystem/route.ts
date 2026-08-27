import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkStorageFilesystem } from '@/lib/health/checks'
import { safeErrorResponse } from '@/lib/api-error'
import { HealthStorageFilesystemSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

export const dynamic = 'force-dynamic'
export const debugRole = 'health-storage-filesystem'

registry.registerPath({
  method: 'get',
  path: '/api/health/storage-filesystem',
  operationId: 'getHealthStorageFilesystem',
  summary: 'Pre-flight check for the local filesystem storage provider (path exists + writable)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Filesystem check result', content: { 'application/json': { schema: HealthStorageFilesystemSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    return NextResponse.json(await checkStorageFilesystem())
  } catch (err: unknown) {
    return NextResponse.json({ error: `Filesystem check failed: ${safeErrorResponse(err)}` }, { status: 500 })
  }
}
