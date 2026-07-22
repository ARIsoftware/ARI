/**
 * Tests for lib/openapi/common.ts
 *
 * common.ts has side effects: on import it:
 *   1. Defines ErrorResponseSchema (a Zod schema)
 *   2. Registers two security schemes in the OpenAPI registry
 *   3. Exports DEFAULT_SECURITY, UnauthorizedResponse, InternalServerErrorResponse
 *
 * We verify the exported values are correctly shaped and that the side effects
 * are observable via the registry's definitions list.
 *
 * NOTE: The registry uses a singleton. common.ts is imported once and its
 * side effects run once per process. We just verify the exports.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock auth-middleware so we can control the exported constants
vi.mock('@/lib/auth-middleware', () => ({
  API_KEY_PREFIX: 'ari_k_',
  BETTER_AUTH_COOKIE_NAME: 'better-auth.session_token',
}))

import {
  ErrorResponseSchema,
  DEFAULT_SECURITY,
  UnauthorizedResponse,
  InternalServerErrorResponse,
} from '@/lib/openapi/common'

// ── ErrorResponseSchema ───────────────────────────────────────────────────────

describe('ErrorResponseSchema', () => {
  it('accepts a minimal error object', () => {
    const result = ErrorResponseSchema.safeParse({ error: 'something went wrong' })
    expect(result.success).toBe(true)
  })

  it('accepts an error with details array', () => {
    const result = ErrorResponseSchema.safeParse({
      error: 'Validation failed',
      details: [{ field: 'name', message: 'required' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts details with optional received field', () => {
    const result = ErrorResponseSchema.safeParse({
      error: 'Validation failed',
      details: [{ field: 'age', message: 'must be number', received: 'hello' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects when error field is missing', () => {
    const result = ErrorResponseSchema.safeParse({ details: [] })
    expect(result.success).toBe(false)
  })

  it('rejects when error is not a string', () => {
    const result = ErrorResponseSchema.safeParse({ error: 42 })
    expect(result.success).toBe(false)
  })
})

// ── DEFAULT_SECURITY ──────────────────────────────────────────────────────────

describe('DEFAULT_SECURITY', () => {
  it('is an array', () => {
    expect(Array.isArray(DEFAULT_SECURITY)).toBe(true)
  })

  it('contains apiKey scheme', () => {
    expect(DEFAULT_SECURITY.some(s => 'apiKey' in s)).toBe(true)
  })

  it('contains sessionCookie scheme', () => {
    expect(DEFAULT_SECURITY.some(s => 'sessionCookie' in s)).toBe(true)
  })

  it('each scheme has an empty-array value', () => {
    for (const scheme of DEFAULT_SECURITY) {
      for (const value of Object.values(scheme)) {
        expect(Array.isArray(value)).toBe(true)
        expect((value as string[]).length).toBe(0)
      }
    }
  })
})

// ── UnauthorizedResponse ──────────────────────────────────────────────────────

describe('UnauthorizedResponse', () => {
  it('has a description string', () => {
    expect(typeof UnauthorizedResponse.description).toBe('string')
    expect(UnauthorizedResponse.description.length).toBeGreaterThan(0)
  })

  it('has application/json content with a schema', () => {
    expect(UnauthorizedResponse.content['application/json'].schema).toBeDefined()
  })

  it('schema validates a typical error object', () => {
    const schema = UnauthorizedResponse.content['application/json'].schema
    const result = schema.safeParse({ error: 'Unauthorized' })
    expect(result.success).toBe(true)
  })
})

// ── InternalServerErrorResponse ───────────────────────────────────────────────

describe('InternalServerErrorResponse', () => {
  it('has a description string', () => {
    expect(typeof InternalServerErrorResponse.description).toBe('string')
    expect(InternalServerErrorResponse.description.length).toBeGreaterThan(0)
  })

  it('has application/json content with a schema', () => {
    expect(InternalServerErrorResponse.content['application/json'].schema).toBeDefined()
  })

  it('schema validates a typical error object', () => {
    const schema = InternalServerErrorResponse.content['application/json'].schema
    const result = schema.safeParse({ error: 'Internal server error' })
    expect(result.success).toBe(true)
  })
})
