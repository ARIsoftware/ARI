import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registry } from './registry'
// Side effect: registers shared security schemes and ErrorResponse schema.
import { DEFAULT_SECURITY } from './common'
import { X_ARI } from './types'
import manifest from '@/lib/generated/module-manifest.json'
import pkg from '@/package.json'

type ModuleSummary = { id: string; name?: string; description?: string }

type PublicRouteEntry = {
  moduleId: string
  fullPath: string
  methods: string[]
  description?: string
  security?: {
    type?: string
    rateLimit?: boolean | number
    requiresAuthIfUsers?: boolean
  }
}

export function buildSpec() {
  const generator = new OpenApiGeneratorV31(registry.definitions)

  const moduleTags = (manifest as { modules?: ModuleSummary[] }).modules?.map((m) => ({
    name: m.id,
    description: m.description ?? m.name ?? m.id,
  })) ?? []

  // Cross-cutting tags used by non-module routes registered under app/api/.
  // Declared here so the OpenAPI lint doesn't flag operations that reference them.
  const appTags = [
    { name: 'app', description: 'ARI application-level routes (api-keys, backup, modules, settings, storage, theme, etc.)' },
    { name: 'auth', description: "Better Auth catch-all and first-run bootstrap. Better Auth's per-endpoint shapes are documented at https://www.better-auth.com/docs." },
  ]

  const tags = [...appTags, ...moduleTags]

  const doc = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'ARI API',
      version: (pkg as { version?: string }).version ?? '0.0.0',
      description:
        'Internal API for the ARI application. All endpoints require authentication via either an ARI API key (header `x-api-key`) or a Better Auth session cookie. Generated from Zod schemas — see `/settings?tab=api` to manage API keys.',
    },
    servers: [
      { url: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000' },
    ],
    security: DEFAULT_SECURITY,
    tags,
  })

  // Manifest carries `isPublic`/rate-limit flags (scanned from `export const
  // isPublic = true` in each route file). OpenAPI doesn't model these, so they
  // ride along as path-level x-ari-* extensions for downstream consumers
  // (/health security tester, /settings?tab=api).
  const publicByPath = new Map<string, PublicRouteEntry>()
  for (const r of ((manifest as { publicRoutes?: PublicRouteEntry[] }).publicRoutes ?? [])) {
    publicByPath.set(r.fullPath, r)
  }

  const paths = doc.paths as Record<string, Record<string, unknown>> | undefined
  if (paths) {
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      // Spec uses {id}; manifest uses [id]. Normalize for cross-lookup so
      // future parameterized public routes match too.
      const manifestStylePath = pathKey.replace(/\{([^}]+)\}/g, '[$1]')
      const entry = publicByPath.get(pathKey) ?? publicByPath.get(manifestStylePath)
      if (!entry) continue
      pathItem[X_ARI.PUBLIC] = true
      pathItem[X_ARI.MODULE_ID] = entry.moduleId
      if (entry.security?.type) pathItem[X_ARI.SECURITY_TYPE] = entry.security.type
      pathItem[X_ARI.RATE_LIMIT] = !!entry.security?.rateLimit
      pathItem[X_ARI.REQUIRES_AUTH_IF_USERS] = !!entry.security?.requiresAuthIfUsers
      if (entry.description) pathItem[X_ARI.DESCRIPTION] = entry.description
    }
  }

  return doc
}
