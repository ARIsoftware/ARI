/**
 * Board of Advisors — provider status route.
 * GET /api/modules/board-of-advisors/providers → resolved provider selection
 *
 * Server-resolves the module's selected provider (key presence, effective
 * model) so the chat page can show an accurate status pill without ever
 * shipping key material to the client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { ProviderStatusResponseSchema } from '@/modules/board-of-advisors/lib/validation'
import {
  readIntegrationSettings,
  resolveBoardProviderFrom,
  isProviderConfiguredIn,
} from '@/modules/board-of-advisors/lib/providers'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { AI_CHAT_PROVIDERS } from '@/lib/ai-providers'
import type { AiProviderId, BoardSettings } from '@/modules/board-of-advisors/types'

registry.registerPath({
  method: 'get',
  path: '/api/modules/board-of-advisors/providers',
  operationId: 'getBoardProviderStatus',
  summary: "Resolve the module's selected AI provider and effective model",
  tags: ['board-of-advisors'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Selected provider status', content: { 'application/json': { schema: ProviderStatusResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const rows = await withRLS((db) =>
      db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, 'board-of-advisors')))
        .limit(1)
    )
    const settings = (rows[0]?.settings ?? {}) as Partial<BoardSettings>
    const selectedId = (settings.selectedAiProvider ?? null) as AiProviderId | null

    // One integrations read serves both the resolution and the count.
    const integrations = await readIntegrationSettings(user.id)
    const configuredCount = AI_CHAT_PROVIDERS
      .filter((p) => isProviderConfiguredIn(integrations, p.id))
      .length

    const resolved = resolveBoardProviderFrom(integrations, selectedId, settings.aiProviderModels)

    let selected: { id: AiProviderId; name: string; model: string; configured: boolean } | null = null
    if (resolved.ok) {
      selected = { id: resolved.provider, name: resolved.providerName, model: resolved.modelId, configured: true }
    } else if (selectedId) {
      selected = { id: selectedId, name: resolved.providerName || selectedId, model: '', configured: false }
    }

    return NextResponse.json({
      selected,
      configured_count: configuredCount,
    })
  } catch (error) {
    console.error('GET /api/modules/board-of-advisors/providers error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
