import { z } from 'zod'
import { registry } from './registry'
import { API_KEY_PREFIX, BETTER_AUTH_COOKIE_NAME } from '@/lib/auth-middleware'

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    details: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
          received: z.unknown().optional(),
        })
      )
      .optional(),
  })
  .openapi('ErrorResponse')

export const UnauthorizedResponse = {
  description: 'Authentication required',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

export const InternalServerErrorResponse = {
  description: 'Internal server error',
  content: { 'application/json': { schema: ErrorResponseSchema } },
}

registry.registerComponent('securitySchemes', 'apiKey', {
  type: 'apiKey',
  in: 'header',
  name: 'x-api-key',
  description: `ARI API key (prefix \`${API_KEY_PREFIX}\`). Generate one in Settings → API.`,
})

registry.registerComponent('securitySchemes', 'sessionCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: BETTER_AUTH_COOKIE_NAME,
  description: 'Better Auth session cookie set after sign-in.',
})

export const DEFAULT_SECURITY: Array<Record<string, string[]>> = [
  { apiKey: [] },
  { sessionCookie: [] },
]
