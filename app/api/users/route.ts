import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { getPgCode } from '@/lib/db/postgres-error'
import {
  PERMISSION_DEFAULTS,
  PERMISSION_KEYS,
  canManageRole,
  canViewUsers,
  hasPermission,
  sanitizePermissionInput,
} from '@/lib/permissions'
import {
  USERS_LOCK_KEY,
  USER_COLUMNS,
  mapUserRow,
  type DbUserRow,
} from './helpers'
import {
  createUserSchema,
  AdminUserSchema,
  AdminUserListResponseSchema,
} from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/users',
  operationId: 'listUsers',
  summary: 'List all user accounts (requires manage_users or manage_admins)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'All accounts, oldest first', content: { 'application/json': { schema: AdminUserListResponseSchema } } },
    401: UnauthorizedResponse,
    403: { description: 'Missing permission', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/users',
  operationId: 'createUser',
  summary: 'Create a user account (manage_users; creating admins requires manage_admins)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: createUserSchema } } } },
  responses: {
    201: { description: 'Created account', content: { 'application/json': { schema: AdminUserSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    403: { description: 'Missing permission', content: { 'application/json': { schema: ErrorResponseSchema } } },
    409: { description: 'Email already in use', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return createErrorResponse('Authentication required', 401)
    if (!canViewUsers(user)) {
      return createErrorResponse('You do not have permission to manage users', 403)
    }
    if (!pool) return createErrorResponse('Database not available', 503)

    const { rows } = await pool.query<DbUserRow>(
      `SELECT ${USER_COLUMNS} FROM "user" ORDER BY "createdAt" ASC`
    )
    return NextResponse.json(rows.map(mapUserRow))
  } catch (error) {
    console.error('Failed to list users:', error)
    return createErrorResponse('Failed to list users', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor } = await getAuthenticatedUser()
    if (!actor) return createErrorResponse('Authentication required', 401)

    const validation = await validateRequestBody(request, createUserSchema)
    if (!validation.success) return validation.response

    const { email, password, firstName, lastName } = validation.data
    // validateRequestBody's ZodSchema<T> generic unifies input/output types,
    // so the .default('user') isn't reflected — apply it explicitly.
    const role = validation.data.role ?? 'user'

    if (!canManageRole(actor, role)) {
      return createErrorResponse(
        role === 'admin'
          ? 'You need the manage_admins permission to create admin accounts'
          : 'You do not have permission to create users',
        403
      )
    }

    // Users start from the permission defaults, overlaid with any explicit
    // grants. Every permission the new account ENDS UP with must be one the
    // actor holds — including default-true keys — otherwise the creator could
    // mint an account more privileged than itself and sign in as it (they set
    // the password). Admin accounts ignore stored grants entirely.
    let storedPermissions = { ...PERMISSION_DEFAULTS }
    if (role === 'user') {
      const grants = sanitizePermissionInput(validation.data.permissions)
      const desired = { ...PERMISSION_DEFAULTS, ...grants }
      for (const key of PERMISSION_KEYS) {
        if (desired[key] && !hasPermission(actor, key)) {
          return createErrorResponse(`You can only grant permissions you hold yourself (${key})`, 403)
        }
      }
      storedPermissions = desired
    }

    if (!pool) return createErrorResponse('Database not available', 503)

    const userId = crypto.randomBytes(16).toString('hex')
    const accountId = crypto.randomBytes(16).toString('hex')
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || email.split('@')[0]
    const passwordHash = await hashPassword(password)

    // Direct insert instead of auth.api.signUpEmail: sign-up is blocked in
    // middleware, and a server-side signUpEmail would auto-create a session
    // for the new user (and hand its cookie to the creating admin via the
    // nextCookies plugin). Better Auth reads users/accounts straight from
    // these tables, so credential rows created here sign in normally.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [USERS_LOCK_KEY])
      await client.query(
        `INSERT INTO "user" ("id", "name", "email", "firstName", "lastName", "role", "permissions")
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [userId, name, email, firstName ?? null, lastName ?? null, role, JSON.stringify(storedPermissions)]
      )
      await client.query(
        `INSERT INTO "account" ("id", "userId", "accountId", "providerId", "password")
         VALUES ($1, $2, $3, 'credential', $4)`,
        [accountId, userId, userId, passwordHash]
      )
      const { rows } = await client.query<DbUserRow>(
        `SELECT ${USER_COLUMNS} FROM "user" WHERE "id" = $1`,
        [userId]
      )
      await client.query('COMMIT')
      return NextResponse.json(mapUserRow(rows[0]), { status: 201 })
    } catch (error) {
      try { await client.query('ROLLBACK') } catch {}
      if (getPgCode(error) === '23505') {
        return createErrorResponse('A user with this email already exists', 409)
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Failed to create user:', error)
    return createErrorResponse('Failed to create user', 500)
  }
}
