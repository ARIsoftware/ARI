import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import { z } from "zod"
import { BetterAuthRequestSchema, BetterAuthResponseSchema } from "@/lib/openapi/app-schemas"
import { registry } from "@/lib/openapi/registry"
import { ErrorResponseSchema } from "@/lib/openapi/common"

const betterAuthPathParam = z.object({
  path: z.string().describe('Better Auth sub-path (e.g. "sign-in/email", "get-session")'),
})

// Better Auth owns this path. The handler dispatches to dozens of sub-paths
// (sign-in, sign-up, get-session, etc.). We document it as a single opaque
// proxy here; consult Better Auth's docs for the per-endpoint schema.
const BETTER_AUTH_DESCRIPTION =
  'Better Auth catch-all. Handles every /api/auth/* endpoint (sign-in, sign-up, get-session, list-sessions, etc.). Request and response shapes are owned by Better Auth — see https://www.better-auth.com/docs for the full surface.'

registry.registerPath({
  method: 'get',
  path: '/api/auth/{path}',
  operationId: 'betterAuthGet',
  summary: 'Better Auth GET dispatcher (opaque proxy)',
  description: BETTER_AUTH_DESCRIPTION,
  tags: ['auth'],
  request: { params: betterAuthPathParam },
  responses: {
    200: { description: 'Better Auth response', content: { 'application/json': { schema: BetterAuthResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/auth/{path}',
  operationId: 'betterAuthPost',
  summary: 'Better Auth POST dispatcher (opaque proxy)',
  description: BETTER_AUTH_DESCRIPTION,
  tags: ['auth'],
  request: {
    params: betterAuthPathParam,
    body: { content: { 'application/json': { schema: BetterAuthRequestSchema } } },
  },
  responses: {
    200: { description: 'Better Auth response', content: { 'application/json': { schema: BetterAuthResponseSchema } } },
    400: { description: 'Bad request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

export const { GET, POST } = toNextJsHandler(auth)
