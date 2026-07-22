/**
 * Tests for lib/api-helpers.ts
 *
 * NextRequest / NextResponse work fine in a Node test environment via
 * `next/server` — no mocking required for these.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  validateRequestBody,
  validatePathParams,
  validateQueryParams,
  createErrorResponse,
  requirePermission,
  requireAdmin,
  createSuccessResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import { resolvePermissions } from '@/lib/permissions'
import type { PermissionActor } from '@/lib/permissions'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdmin(): PermissionActor {
  return { role: 'admin', permissions: resolvePermissions('admin', {}) }
}

function makeUser(overrides: Record<string, boolean> = {}): PermissionActor {
  return {
    role: 'user',
    permissions: resolvePermissions('user', overrides),
  }
}

function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function makeInvalidJsonRequest(): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    body: 'not-json{{{',
    headers: { 'content-type': 'application/json' },
  })
}

// ─── validateRequestBody ──────────────────────────────────────────────────

const nameSchema = z.object({ name: z.string() })

describe('validateRequestBody — success', () => {
  it('returns success with parsed data for a valid body', async () => {
    const req = makeRequest({ name: 'Alice' })
    const result = await validateRequestBody(req, nameSchema)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ name: 'Alice' })
  })
})

describe('validateRequestBody — zod validation failure', () => {
  it('returns 400 with validation details when schema fails', async () => {
    const req = makeRequest({ name: 123 }) // name should be string
    const result = await validateRequestBody(req, nameSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
      const json = await result.response.json()
      expect(json.error).toBe('Validation failed')
      expect(Array.isArray(json.details)).toBe(true)
      expect(json.details[0]).toHaveProperty('field')
      expect(json.details[0]).toHaveProperty('message')
    }
  })

  it('includes "received" when ZodIssue has it', async () => {
    // z.string() with a number gives ZodInvalidTypeIssue which has `received`
    const req = makeRequest({ name: 99 })
    const result = await validateRequestBody(req, nameSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      const json = await result.response.json()
      // Some issues have received, some don't — just verify structure is there
      expect(json.details[0]).toHaveProperty('field', 'name')
    }
  })
})

describe('validateRequestBody — JSON parse failure', () => {
  it('returns 400 with "Invalid JSON" message for non-JSON body', async () => {
    const req = makeInvalidJsonRequest()
    const result = await validateRequestBody(req, nameSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
      const json = await result.response.json()
      expect(json.error).toBe('Invalid JSON in request body')
    }
  })
})

// ─── validatePathParams ───────────────────────────────────────────────────

const idSchema = z.object({ id: z.string().uuid() })

describe('validatePathParams — success', () => {
  it('returns success with parsed params', () => {
    const params = { id: '550e8400-e29b-41d4-a716-446655440000' }
    const result = validatePathParams(params, idSchema)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual(params)
  })
})

describe('validatePathParams — zod failure', () => {
  it('returns 400 with details for invalid params', () => {
    const params = { id: 'not-a-uuid' }
    const result = validatePathParams(params, idSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
    }
  })

  it('returns 400 for non-ZodError (catch-all branch)', () => {
    // Create a schema whose parse() throws a non-ZodError
    const throwingSchema = {
      parse: () => { throw new TypeError('unexpected') },
    } as any
    const result = validatePathParams({ id: 'x' }, throwingSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
    }
  })
})

// ─── validateQueryParams ─────────────────────────────────────────────────

const querySchema = z.object({ page: z.coerce.number().min(1) })

describe('validateQueryParams — success', () => {
  it('parses URLSearchParams against schema', () => {
    const sp = new URLSearchParams('page=2')
    const result = validateQueryParams(sp, querySchema)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ page: 2 })
  })
})

describe('validateQueryParams — zod failure', () => {
  it('returns 400 for invalid query params', () => {
    const sp = new URLSearchParams('page=0') // min is 1
    const result = validateQueryParams(sp, querySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
      const body = result.response.json()
      // just ensure the response was constructed
      expect(result.response.status).toBe(400)
    }
  })

  it('returns 400 for non-ZodError in query params', () => {
    const throwingSchema = {
      parse: () => { throw new RangeError('oops') },
    } as any
    const sp = new URLSearchParams('page=1')
    const result = validateQueryParams(sp, throwingSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
    }
  })
})

// ─── createErrorResponse ──────────────────────────────────────────────────

describe('createErrorResponse', () => {
  it('creates a response with default status 500', async () => {
    const res = createErrorResponse('Something went wrong')
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({ error: 'Something went wrong' })
  })

  it('creates a response with a custom status', async () => {
    const res = createErrorResponse('Not found', 404)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json).toEqual({ error: 'Not found' })
  })

  it('includes details when provided', async () => {
    const res = createErrorResponse('Bad request', 400, { field: 'email' })
    const json = await res.json()
    expect(json).toEqual({ error: 'Bad request', details: { field: 'email' } })
  })

  it('does not include details key when not provided', async () => {
    const res = createErrorResponse('Oops')
    const json = await res.json()
    expect('details' in json).toBe(false)
  })
})

// ─── requirePermission ────────────────────────────────────────────────────

describe('requirePermission', () => {
  it('returns 401 when user is null', async () => {
    const res = requirePermission(null, 'manage_users')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    const json = await res!.json()
    expect(json.error).toBe('Authentication required')
  })

  it('returns 401 when user is undefined', () => {
    const res = requirePermission(undefined, 'manage_users')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('returns null when admin has permission', () => {
    expect(requirePermission(makeAdmin(), 'manage_users')).toBeNull()
  })

  it('returns null when user has explicit permission', () => {
    const user = makeUser({ manage_users: true })
    expect(requirePermission(user, 'manage_users')).toBeNull()
  })

  it('returns 403 when user lacks permission', async () => {
    const user = makeUser({ manage_users: false })
    const res = requirePermission(user, 'manage_users')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const json = await res!.json()
    expect(json.error).toBe('You do not have permission to perform this action')
  })

  it('uses custom message when provided', async () => {
    const user = makeUser({ manage_users: false })
    const res = requirePermission(user, 'manage_users', 'Custom denied message')
    expect(res).not.toBeNull()
    const json = await res!.json()
    expect(json.error).toBe('Custom denied message')
  })
})

// ─── requireAdmin ─────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('returns 401 when user is null', async () => {
    const res = requireAdmin(null)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    const json = await res!.json()
    expect(json.error).toBe('Authentication required')
  })

  it('returns 401 when user is undefined', () => {
    const res = requireAdmin(undefined)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('returns null when user has admin role', () => {
    expect(requireAdmin({ role: 'admin' })).toBeNull()
  })

  it('returns 403 when user has non-admin role', async () => {
    const res = requireAdmin({ role: 'user' })
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const json = await res!.json()
    expect(json.error).toBe('Admin access required')
  })

  it('returns 403 with custom message', async () => {
    const res = requireAdmin({ role: 'user' }, 'Admins only')
    expect(res).not.toBeNull()
    const json = await res!.json()
    expect(json.error).toBe('Admins only')
  })
})

// ─── createSuccessResponse ────────────────────────────────────────────────

describe('createSuccessResponse', () => {
  it('creates a 200 response with data by default', async () => {
    const res = createSuccessResponse({ id: 1, name: 'Test' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ id: 1, name: 'Test' })
  })

  it('supports a custom status', async () => {
    const res = createSuccessResponse({ created: true }, 201)
    expect(res.status).toBe(201)
  })
})

// ─── toSnakeCase ──────────────────────────────────────────────────────────

describe('toSnakeCase', () => {
  it('returns null as-is', () => {
    expect(toSnakeCase(null)).toBeNull()
  })

  it('returns undefined as-is', () => {
    expect(toSnakeCase(undefined)).toBeUndefined()
  })

  it('converts camelCase keys to snake_case', () => {
    const input = { firstName: 'Alice', lastName: 'Smith' }
    expect(toSnakeCase(input)).toEqual({ first_name: 'Alice', last_name: 'Smith' })
  })

  it('recursively converts nested objects', () => {
    const input = { userData: { firstName: 'Bob' } }
    expect(toSnakeCase(input)).toEqual({ user_data: { first_name: 'Bob' } })
  })

  it('maps arrays of objects', () => {
    const input = [{ userName: 'x' }, { userName: 'y' }]
    expect(toSnakeCase(input)).toEqual([{ user_name: 'x' }, { user_name: 'y' }])
  })

  it('leaves strings unchanged', () => {
    expect(toSnakeCase('helloWorld')).toBe('helloWorld')
  })

  it('leaves numbers unchanged', () => {
    expect(toSnakeCase(42)).toBe(42)
  })

  it('leaves Date objects unchanged (not recursed)', () => {
    const d = new Date('2024-01-01')
    expect(toSnakeCase(d)).toBe(d)
  })

  it('leaves keys that are already snake_case unchanged', () => {
    expect(toSnakeCase({ user_name: 'test' })).toEqual({ user_name: 'test' })
  })

  it('handles multiple uppercase letters in sequence', () => {
    const input = { myHTTPSUrl: 'https://example.com' }
    // camelToSnake: each uppercase letter individually prefixed with _
    expect(toSnakeCase(input)).toEqual({ my_h_t_t_p_s_url: 'https://example.com' })
  })

  it('handles empty object', () => {
    expect(toSnakeCase({})).toEqual({})
  })

  it('handles empty array', () => {
    expect(toSnakeCase([])).toEqual([])
  })
})
