import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { getPgCode } from '@/lib/db/postgres-error'
import {
  canManageUser,
  hasPermission,
  resolvePermissions,
  sanitizePermissionInput,
  type PermissionKey,
  type UserRole,
} from '@/lib/permissions'
import {
  USERS_LOCK_KEY,
  USER_COLUMNS,
  buildDisplayName,
  countOtherActiveAdmins,
  mapUserRow,
  revokeUserSessions,
  type DbUserRow,
} from '../helpers'
import {
  appIdParamSchema,
  updateUserSchema,
  AdminUserSchema,
  SuccessSchema,
} from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'patch',
  path: '/api/users/{id}',
  operationId: 'updateUser',
  summary: 'Update a user account (profile, password, role, permissions, disabled)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: {
    params: appIdParamSchema,
    body: { content: { 'application/json': { schema: updateUserSchema } } },
  },
  responses: {
    200: { description: 'Updated account', content: { 'application/json': { schema: AdminUserSchema } } },
    400: { description: 'Validation error or guarded action', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    403: { description: 'Missing permission', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'User not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    409: { description: 'Email already in use', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/users/{id}',
  operationId: 'deleteUser',
  summary: 'Delete a user account (cannot delete yourself or the last active admin)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { params: appIdParamSchema },
  responses: {
    200: { description: 'Account deleted', content: { 'application/json': { schema: SuccessSchema } } },
    400: { description: 'Guarded action (self-delete, last admin)', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    403: { description: 'Missing permission', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'User not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor } = await getAuthenticatedUser()
    if (!actor) return createErrorResponse('Authentication required', 401)

    const { id: targetId } = await params
    const validation = await validateRequestBody(request, updateUserSchema)
    if (!validation.success) return validation.response
    const body = validation.data

    if (!pool) return createErrorResponse('Database not available', 503)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [USERS_LOCK_KEY])

      const { rows } = await client.query<DbUserRow>(
        `SELECT ${USER_COLUMNS} FROM "user" WHERE "id" = $1 FOR UPDATE`,
        [targetId]
      )
      const target = rows[0]
      if (!target) {
        await client.query('ROLLBACK')
        return createErrorResponse('User not found', 404)
      }

      const targetRole: UserRole = target.role === 'admin' ? 'admin' : 'user'
      const targetAccess = { role: targetRole, permissions: resolvePermissions(targetRole, target.permissions) }
      if (!canManageUser(actor, targetAccess)) {
        await client.query('ROLLBACK')
        return createErrorResponse(
          targetRole === 'admin'
            ? 'You need the manage_admins permission to edit admin accounts'
            : 'You do not have permission to edit this user',
          403
        )
      }

      const isSelf = actor.id === target.id

      // --- Role change ---
      let newRole: UserRole = targetRole
      if (body.role && body.role !== targetRole) {
        if (!hasPermission(actor, 'manage_admins')) {
          await client.query('ROLLBACK')
          return createErrorResponse('You need the manage_admins permission to change roles', 403)
        }
        if (isSelf) {
          await client.query('ROLLBACK')
          return createErrorResponse('You cannot change your own role', 400)
        }
        newRole = body.role
      }

      // --- Disable / re-enable ---
      let newDisabled = target.disabled === true
      if (typeof body.disabled === 'boolean' && body.disabled !== newDisabled) {
        if (isSelf) {
          await client.query('ROLLBACK')
          return createErrorResponse('You cannot disable your own account', 400)
        }
        newDisabled = body.disabled
      }

      // --- Last-active-admin invariant ---
      // Any admin (including the first account) may be demoted or disabled,
      // but never the last active one — that would leave an install nobody
      // can manage.
      if (
        targetRole === 'admin' && target.disabled !== true &&
        (newRole !== 'admin' || newDisabled)
      ) {
        const others = await countOtherActiveAdmins(client, target.id)
        if (others === 0) {
          await client.query('ROLLBACK')
          return createErrorResponse('ARI needs at least one active admin — promote another admin first', 400)
        }
      }

      // --- Permission grants (only meaningful for the user role) ---
      let newPermissions = target.permissions
      if (body.permissions && newRole === 'user') {
        const grants = sanitizePermissionInput(body.permissions)
        const currentEffective = resolvePermissions('user', target.permissions)
        for (const [key, value] of Object.entries(grants)) {
          const permKey = key as PermissionKey
          if (value !== currentEffective[permKey]) {
            // You cannot change your own permissions (matches the UI, and
            // prevents irreversibly revoking your own manage_users).
            if (isSelf) {
              await client.query('ROLLBACK')
              return createErrorResponse('You cannot change your own permissions', 400)
            }
            if (!hasPermission(actor, permKey)) {
              await client.query('ROLLBACK')
              return createErrorResponse(`You can only change permissions you hold yourself (${permKey})`, 403)
            }
          }
        }
        newPermissions = { ...currentEffective, ...grants }
      }

      // --- Profile fields ---
      const newFirstName = body.firstName !== undefined ? body.firstName : target.firstName
      const newLastName = body.lastName !== undefined ? body.lastName : target.lastName
      const newEmail = body.email ?? target.email
      const newName =
        body.firstName !== undefined || body.lastName !== undefined
          ? buildDisplayName(newFirstName, newLastName, newEmail)
          : target.name

      await client.query(
        `UPDATE "user"
         SET "name" = $2, "email" = $3, "firstName" = $4, "lastName" = $5,
             "role" = $6, "permissions" = $7::jsonb, "disabled" = $8, "updatedAt" = NOW()
         WHERE "id" = $1`,
        [target.id, newName, newEmail, newFirstName, newLastName, newRole, JSON.stringify(newPermissions ?? {}), newDisabled]
      )

      // --- Password reset ---
      if (body.password) {
        const passwordHash = await hashPassword(body.password)
        const updated = await client.query(
          `UPDATE "account" SET "password" = $2, "updatedAt" = NOW()
           WHERE "userId" = $1 AND "providerId" = 'credential'`,
          [target.id, passwordHash]
        )
        if (updated.rowCount === 0) {
          await client.query(
            `INSERT INTO "account" ("id", "userId", "accountId", "providerId", "password")
             VALUES ($1, $2, $3, 'credential', $4)`,
            [crypto.randomBytes(16).toString('hex'), target.id, target.id, passwordHash]
          )
        }
      }

      // Password changes and disables kick out existing sessions immediately.
      if (body.password || (newDisabled && target.disabled !== true)) {
        await revokeUserSessions(client, target.id)
      }

      const { rows: updatedRows } = await client.query<DbUserRow>(
        `SELECT ${USER_COLUMNS} FROM "user" WHERE "id" = $1`,
        [target.id]
      )
      await client.query('COMMIT')
      return NextResponse.json(mapUserRow(updatedRows[0]))
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
    console.error('Failed to update user:', error)
    return createErrorResponse('Failed to update user', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor } = await getAuthenticatedUser()
    if (!actor) return createErrorResponse('Authentication required', 401)

    const { id: targetId } = await params
    if (actor.id === targetId) {
      return createErrorResponse('You cannot delete your own account', 400)
    }

    if (!pool) return createErrorResponse('Database not available', 503)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [USERS_LOCK_KEY])

      const { rows } = await client.query<DbUserRow>(
        `SELECT ${USER_COLUMNS} FROM "user" WHERE "id" = $1 FOR UPDATE`,
        [targetId]
      )
      const target = rows[0]
      if (!target) {
        await client.query('ROLLBACK')
        return createErrorResponse('User not found', 404)
      }

      const targetRole: UserRole = target.role === 'admin' ? 'admin' : 'user'
      const targetAccess = { role: targetRole, permissions: resolvePermissions(targetRole, target.permissions) }
      if (!canManageUser(actor, targetAccess)) {
        await client.query('ROLLBACK')
        return createErrorResponse(
          targetRole === 'admin'
            ? 'You need the manage_admins permission to delete admin accounts'
            : 'You do not have permission to delete this user',
          403
        )
      }

      if (targetRole === 'admin' && target.disabled !== true) {
        const others = await countOtherActiveAdmins(client, target.id)
        if (others === 0) {
          await client.query('ROLLBACK')
          return createErrorResponse('ARI needs at least one active admin — promote another admin first', 400)
        }
      }

      // Explicitly delete every row this user owns in the auth/system tables.
      // setup.sql (the DDL source of truth for fresh installs) only declares a
      // FK cascade on api_keys and its usage logs — session, account (holds the
      // Argon2 password hash), twoFactor (TOTP secret + backup codes),
      // user_preferences and module_settings have NO cascade, so without this
      // they would be orphaned (stale credential material left in the DB).
      // The user's content rows (tasks, documents, ...) are intentionally
      // kept — ownership handling for shared data lands with the shared
      // workspace phase.
      await client.query('DELETE FROM "session" WHERE "userId" = $1', [target.id])
      await client.query('DELETE FROM "account" WHERE "userId" = $1', [target.id])
      await client.query('DELETE FROM "twoFactor" WHERE "userId" = $1', [target.id])
      await client.query('DELETE FROM "api_keys" WHERE "user_id" = $1', [target.id])
      await client.query('DELETE FROM "user_preferences" WHERE "user_id" = $1', [target.id])
      await client.query('DELETE FROM "module_settings" WHERE "user_id" = $1', [target.id])
      await client.query('DELETE FROM "user" WHERE "id" = $1', [target.id])

      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (error) {
      try { await client.query('ROLLBACK') } catch {}
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Failed to delete user:', error)
    return createErrorResponse('Failed to delete user', 500)
  }
}
