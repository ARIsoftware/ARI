import { NextResponse } from 'next/server'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { safeErrorResponse } from '@/lib/api-error'
import { readStorageConfig, getDefaultLocalStorageBasePath, isStorageUnavailable } from '@/lib/storage'
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
    const config = readStorageConfig()
    if (config.provider !== 'filesystem') {
      return NextResponse.json({ provider: config.provider, applicable: false })
    }

    const basePath = getDefaultLocalStorageBasePath()
    const isEphemeral = isStorageUnavailable(config)

    let exists = false
    let writable = false
    let error: string | undefined

    try {
      await fs.mkdir(basePath, { recursive: true })
      exists = true
      // Prove writability by actually writing — fs.access(W_OK) is TOCTOU and
      // misses quota/noexec/parent-perm-changed-after-mkdir cases.
      const probe = path.join(basePath, `.ari-health-write-probe-${process.pid}-${Date.now()}`)
      await fs.writeFile(probe, '')
      await fs.unlink(probe)
      writable = true
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException
      error = e.code ? `${e.code}: ${e.message}` : (e.message ?? String(err))
    }

    return NextResponse.json({
      provider: 'filesystem',
      applicable: true,
      basePath,
      exists,
      writable,
      isEphemeral,
      ...(error ? { error } : {}),
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: `Filesystem check failed: ${safeErrorResponse(err)}` }, { status: 500 })
  }
}
