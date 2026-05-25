import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema } from '@/lib/openapi/common'

export const debugRole = 'openapi-spec'

const SPEC_PATH = path.join(process.cwd(), 'lib', 'generated', 'openapi.json')

// Spec is regenerated only at `predev`/`prebuild` — it can't change without
// restarting the process, so cache it after the first successful read.
let cachedSpec: Record<string, unknown> | null = null

registry.registerPath({
  method: 'get',
  path: '/api/openapi.json',
  operationId: 'getOpenApiSpec',
  summary: 'OpenAPI 3.1 specification',
  description:
    "Returns the OpenAPI 3.1 specification for the ARI API. The spec is auto-generated from each route's Zod schemas during `pnpm dev` / `pnpm build`. `servers[0].url` is overridden at request time to match the deployed environment.",
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: 'OpenAPI 3.1 specification document',
      content: { 'application/json': { schema: z.any() } },
    },
    401: {
      description: 'Unauthorized — missing or invalid session/API key',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Spec not generated yet — run `pnpm run generate-openapi`',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!cachedSpec) {
    try {
      const raw = await fs.readFile(SPEC_PATH, 'utf8')
      cachedSpec = JSON.parse(raw)
    } catch (err) {
      console.error('[openapi.json] Failed to read spec:', err)
      return NextResponse.json(
        { error: 'Spec not generated. Run `pnpm run generate-openapi`.' },
        { status: 500 }
      )
    }
  }

  const serverUrl = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin
  return NextResponse.json({ ...cachedSpec, servers: [{ url: serverUrl }] })
}
