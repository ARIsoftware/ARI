/**
 * Module Template Module - AI generate route
 *
 * POST /api/modules/module-template/generate
 *
 * Turns the user's selected AI provider (saved in this module's settings) into
 * a real, non-streaming LLM call. This is the demo consumption path that makes
 * the provider selection end-to-end testable.
 *
 * Flow: auth → validate { prompt } → read selectedAiProvider from
 * module_settings → resolve key + model from the integrations store → call the
 * provider → return { text, provider, model }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  GenerateRequestSchema,
  GenerateResponseSchema,
} from '@/modules/module-template/lib/validation'
import { getProviderCredentials } from '@/modules/module-template/lib/provider-keys'
import { callLLM } from '@/modules/module-template/lib/llm-clients'
import { AI_PROVIDERS, type AiProviderId } from '@/lib/ai-providers'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { moduleSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

registry.registerPath({
  method: 'post',
  path: '/api/modules/module-template/generate',
  operationId: 'generateModuleTemplate',
  summary: 'Generate a response using the user\'s selected AI provider',
  tags: ['module-template'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: GenerateRequestSchema } } } },
  responses: {
    200: { description: 'Generated text', content: { 'application/json': { schema: GenerateResponseSchema } } },
    400: { description: 'No provider selected / no API key / validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    502: { description: 'Upstream provider error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, GenerateRequestSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Read the saved provider choice from this module's settings.
    const rows = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(eq(moduleSettings.moduleId, 'module-template'))
        .limit(1)
    )
    const settings = (rows[0]?.settings ?? {}) as { selectedAiProvider?: AiProviderId | null }
    const provider = settings.selectedAiProvider ?? null

    if (!provider) {
      return createErrorResponse('No AI provider selected', 400)
    }
    if (!AI_PROVIDERS.some((p) => p.id === provider)) {
      return createErrorResponse('Selected AI provider is not recognized', 400)
    }

    const { apiKey, model } = await getProviderCredentials(user.id, provider)
    if (!apiKey) {
      return createErrorResponse('Selected provider has no API key configured', 400)
    }

    try {
      const { text } = await callLLM({
        provider,
        apiKey,
        model,
        system: 'You are a helpful assistant inside the ARI module template.',
        prompt: validation.data.prompt,
      })
      return NextResponse.json({ text, provider, model })
    } catch (err) {
      // Upstream/provider failure — surface a safe 502 without leaking the key.
      console.error('module-template generate upstream error:', err instanceof Error ? err.message : err)
      return createErrorResponse('The AI provider failed to generate a response. Check the API key and model.', 502)
    }
  } catch (error) {
    console.error('POST /api/modules/module-template/generate error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
