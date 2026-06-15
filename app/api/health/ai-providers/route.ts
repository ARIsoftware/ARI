import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { HealthAiProvidersSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { AI_PROVIDERS } from '@/lib/ai-providers'
import { INTEGRATIONS_MODULE_ID } from '@/lib/constants'
import { moduleSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const debugRole = "health-ai-providers"

registry.registerPath({
  method: 'get',
  path: '/api/health/ai-providers',
  operationId: 'getHealthAiProviders',
  summary: 'Per-provider AI key configuration status (env vs saved), no secrets exposed',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'AI provider configuration status', content: { 'application/json': { schema: HealthAiProvidersSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

/**
 * GET /api/health/ai-providers
 * Reports, per provider, whether a primary key is configured and where it comes
 * from (`env` takes precedence over a `db`-saved value). Never returns secrets.
 */
export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rows = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, INTEGRATIONS_MODULE_ID))
        .limit(1)
    )
    const saved = (rows[0]?.settings ?? {}) as Record<string, unknown>

    const providers = AI_PROVIDERS.map((p) => {
      const envVal = process.env[p.primaryEnvKey]
      const savedVal = saved[p.primaryEnvKey]
      const source: 'env' | 'db' | null =
        envVal && envVal.length > 0
          ? 'env'
          : typeof savedVal === 'string' && savedVal.length > 0
            ? 'db'
            : null
      return { id: p.id, name: p.name, configured: source !== null, source }
    })

    const configuredCount = providers.filter((p) => p.configured).length
    return NextResponse.json({
      status: configuredCount > 0 ? 'ok' : 'none',
      configuredCount,
      providers,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to check AI providers' }, { status: 500 })
  }
}
