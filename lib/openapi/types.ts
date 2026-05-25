// Minimal OpenAPI shapes + shared constants used by both the build-time spec
// generator and the runtime UI consumers (/health, /settings?tab=api). Kept
// side-effect-free so client bundles don't pull in registry/schema imports.

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const
export type HttpMethod = typeof HTTP_METHODS[number]

// Tags reserved for non-module routes. Any other tag is a module id.
export const NON_MODULE_TAGS = new Set<string>(['app', 'auth'])

// Path-level extension keys ARI writes on the OpenAPI spec to carry security
// metadata not expressible in standard OpenAPI. Source of truth — both writers
// (lib/openapi/build-spec.ts) and readers (app/health/page.tsx) reference this.
export const X_ARI = {
  PUBLIC: 'x-ari-public',
  MODULE_ID: 'x-ari-module-id',
  SECURITY_TYPE: 'x-ari-security-type',
  RATE_LIMIT: 'x-ari-rate-limit',
  REQUIRES_AUTH_IF_USERS: 'x-ari-requires-auth-if-users',
  DESCRIPTION: 'x-ari-description',
} as const

export interface OpenApiOperation {
  tags?: string[]
  [key: string]: unknown
}

export type OpenApiPathItem = {
  [M in HttpMethod]?: OpenApiOperation
} & {
  [extension: string]: unknown
}

export interface OpenApiSpec {
  paths?: Record<string, OpenApiPathItem>
  [key: string]: unknown
}
