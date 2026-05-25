/**
 * Documents Module - Settings API Routes
 *
 * Endpoints:
 * - GET /api/modules/documents/settings  - Get user's settings + active global provider
 * - PUT /api/modules/documents/settings  - Update user's settings
 *
 * Storage provider is NOT a documents setting — it's resolved from
 * ARI_STORAGE_PROVIDER in .env.local. The GET response includes the active
 * provider so the settings UI can display it read-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { moduleSettings } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { readStorageConfig, PROVIDER_LABELS } from '@/lib/storage'
import { DEFAULT_DOCUMENTS_SETTINGS, MODULE_ID } from '../../types'
import { getActiveProvider } from '../../lib/providers'
import {
  DocumentSettingsBodySchema as SettingsSchema,
  DocumentSettingsResponseSchema,
  DocumentSettingsSaveResponseSchema,
} from '../../lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/documents/settings',
  operationId: 'getDocumentsSettings',
  summary: "Fetch the user's Documents module settings plus the active global storage provider info",
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Settings (with global provider info appended)', content: { 'application/json': { schema: DocumentSettingsResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/documents/settings',
  operationId: 'updateDocumentsSettings',
  summary: 'JSON-merge update of Documents module settings',
  tags: ['documents'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: SettingsSchema } } } },
  responses: {
    200: { description: 'Settings saved', content: { 'application/json': { schema: DocumentSettingsSaveResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const data = await withRLS((db) =>
      db.select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
        .limit(1)
    )

    const settings = data.length === 0
      ? DEFAULT_DOCUMENTS_SETTINGS
      : { ...DEFAULT_DOCUMENTS_SETTINGS, ...(data[0]?.settings as object || {}) }

    const activeProvider = getActiveProvider()
    const ariProvider = readStorageConfig().provider
    return NextResponse.json({
      ...settings,
      globalProvider: {
        provider: activeProvider,
        label: PROVIDER_LABELS[ariProvider] ?? ariProvider,
        source: process.env.ARI_STORAGE_PROVIDER ? 'env' : 'default',
      },
    })

  } catch (error) {
    console.error('GET /api/modules/documents/settings error:', error)
    return createErrorResponse('Internal server error')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return createErrorResponse('Authentication required', 401)
    }

    const validation = await validateRequestBody(request, SettingsSchema)
    if (!validation.success) return validation.response

    const existing = await withRLS((db) =>
      db.select({ id: moduleSettings.id, settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, MODULE_ID)))
        .limit(1)
    )

    const currentSettings = existing.length > 0 ? (existing[0].settings as object || {}) : {}
    const mergedSettings = { ...currentSettings, ...validation.data }

    if (existing.length > 0) {
      await withRLS((db) =>
        db.update(moduleSettings)
          .set({
            settings: mergedSettings,
            updatedAt: sql`timezone('utc'::text, now())`
          })
          .where(and(eq(moduleSettings.id, existing[0].id), eq(moduleSettings.userId, user.id)))
      )
    } else {
      await withRLS((db) =>
        db.insert(moduleSettings)
          .values({
            userId: user.id,
            moduleId: MODULE_ID,
            settings: mergedSettings
          })
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully'
    })

  } catch (error) {
    console.error('PUT /api/modules/documents/settings error:', error)
    return createErrorResponse('Internal server error')
  }
}
