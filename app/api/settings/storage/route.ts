import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { readStorageConfig, PROVIDER_LABELS } from '@/lib/storage'

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return createErrorResponse('Unauthorized', 401)
    }

    const config = readStorageConfig()
    const source: 'env' | 'default' = process.env.ARI_STORAGE_PROVIDER ? 'env' : 'default'

    return NextResponse.json({
      provider: config.provider,
      providerLabel: PROVIDER_LABELS[config.provider] ?? config.provider,
      source,
    })
  } catch (error: unknown) {
    console.error('[Storage Settings GET]', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
