import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { readStorageConfig, PROVIDER_LABELS } from '@/lib/storage'
import { SettingsStorageInfoSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/settings/storage',
  operationId: 'getStorageSettings',
  summary: 'Read-only storage provider info (provider, label, env var status)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Storage configuration', content: { 'application/json': { schema: SettingsStorageInfoSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

const PROVIDER_ENV_VARS: Record<string, Array<{ name: string; required: boolean }>> = {
  filesystem: [],
  s3: [
    { name: 'ARI_S3_ACCESS_KEY_ID', required: true },
    { name: 'ARI_S3_SECRET_ACCESS_KEY', required: true },
    { name: 'ARI_S3_BUCKET', required: true },
    { name: 'ARI_S3_REGION', required: false },
    { name: 'ARI_S3_ENDPOINT', required: false },
  ],
  r2: [
    { name: 'ARI_R2_ACCOUNT_ID', required: true },
    { name: 'ARI_R2_ACCESS_KEY_ID', required: true },
    { name: 'ARI_R2_SECRET_ACCESS_KEY', required: true },
    { name: 'ARI_R2_BUCKET', required: true },
  ],
  'supabase-s3': [
    { name: 'ARI_SUPABASE_S3_ENDPOINT', required: true },
    { name: 'ARI_SUPABASE_S3_ACCESS_KEY_ID', required: true },
    { name: 'ARI_SUPABASE_S3_SECRET_ACCESS_KEY', required: true },
    { name: 'ARI_SUPABASE_S3_BUCKET', required: true },
    { name: 'ARI_SUPABASE_S3_REGION', required: false },
  ],
}

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const config = readStorageConfig()
    const source: 'env' | 'default' = process.env.ARI_STORAGE_PROVIDER ? 'env' : 'default'

    const providerVars = PROVIDER_ENV_VARS[config.provider] ?? []
    const envVars = [
      { name: 'ARI_STORAGE_PROVIDER', set: !!process.env.ARI_STORAGE_PROVIDER, required: false },
      ...providerVars.map(v => ({
        name: v.name,
        set: !!process.env[v.name],
        required: v.required,
      })),
    ]

    return NextResponse.json({
      provider: config.provider,
      providerLabel: PROVIDER_LABELS[config.provider] ?? config.provider,
      source,
      envVars,
    })
  } catch (error: unknown) {
    console.error('[Storage Settings GET]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
