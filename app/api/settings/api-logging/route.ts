/**
 * Per-user API request-logging configuration.
 *
 * Currently just the retention window for `api_key_usage_logs`. Stored in
 * `module_settings` under the reserved `__api_logging__` id — the same
 * pseudo-module convention as `__license__` / `__update_check__`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { withApiLogging } from '@/lib/api-logging'
import {
  getRetentionDays,
  setRetentionDays,
  RETENTION_DAY_OPTIONS,
  DEFAULT_RETENTION_DAYS,
} from '@/lib/api-log-retention'
import { ApiLoggingSettingsSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import {
  DEFAULT_SECURITY,
  ErrorResponseSchema,
  InternalServerErrorResponse,
  UnauthorizedResponse,
} from '@/lib/openapi/common'

export const debugRole = 'settings-api-logging'

registry.registerPath({
  method: 'get',
  path: '/api/settings/api-logging',
  operationId: 'getApiLoggingSettings',
  summary: 'Read the current user\'s API request-log retention window',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Retention settings', content: { 'application/json': { schema: ApiLoggingSettingsSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/settings/api-logging',
  operationId: 'updateApiLoggingSettings',
  summary: 'Set the API request-log retention window (null = never expire)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Updated retention settings', content: { 'application/json': { schema: ApiLoggingSettingsSchema } } },
    400: { description: 'Invalid input', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

/** Only the offered windows, or null for "never". */
const updateSchema = z.object({
  retentionDays: z
    .number()
    .int()
    .nullable()
    .refine(
      (v) => v === null || (RETENTION_DAY_OPTIONS as readonly number[]).includes(v),
      { message: `Must be null or one of: ${RETENTION_DAY_OPTIONS.join(', ')}` }
    )
    .describe('Days to keep usage logs, or null to keep them indefinitely'),
})

async function handleGET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return createErrorResponse('Authentication required', 401)

    return NextResponse.json({
      retentionDays: await getRetentionDays(user.id),
      options: RETENTION_DAY_OPTIONS,
      default: DEFAULT_RETENTION_DAYS,
    })
  } catch (error) {
    console.error('Failed to read API logging settings:', error)
    return createErrorResponse('Failed to read API logging settings', 500)
  }
}

async function handlePUT(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return createErrorResponse('Authentication required', 401)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return createErrorResponse('Invalid JSON body', 400)
    }

    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return createErrorResponse('Invalid retention value', 400)
    }

    await setRetentionDays(user.id, parsed.data.retentionDays)

    return NextResponse.json({
      retentionDays: parsed.data.retentionDays,
      options: RETENTION_DAY_OPTIONS,
      default: DEFAULT_RETENTION_DAYS,
    })
  } catch (error) {
    console.error('Failed to update API logging settings:', error)
    return createErrorResponse('Failed to update API logging settings', 500)
  }
}

export const GET = withApiLogging(handleGET)
export const PUT = withApiLogging(handlePUT)
