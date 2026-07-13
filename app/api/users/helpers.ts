// Shared helpers for the admin Users API (app/api/users).
//
// These routes manage rows in the Better Auth "user"/"account"/"session"
// tables, so they use raw pool clients (like app/api/auth/bootstrap) instead
// of withRLS — the user table's RLS policy denies everything and relies on
// the pool role's table ownership, exactly like Better Auth's own queries.

import type { PoolClient } from 'pg'
import { resolvePermissions, type PermissionMap, type UserRole } from '@/lib/permissions'

// Constant key for pg_advisory_xact_lock so concurrent user-management
// mutations serialize. Prevents e.g. two simultaneous deletes of the two
// remaining admins from each passing the last-admin check. (The bootstrap
// route uses 9173451.)
export const USERS_LOCK_KEY = 9173452

export const USER_COLUMNS =
  '"id", "name", "email", "firstName", "lastName", "image", "role", "permissions", "disabled", "twoFactorEnabled", "createdAt", "updatedAt"'

export type DbUserRow = {
  id: string
  name: string | null
  email: string
  firstName: string | null
  lastName: string | null
  image: string | null
  role: string
  permissions: unknown
  disabled: boolean
  twoFactorEnabled: boolean | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
}

export type AdminUserResponse = {
  id: string
  email: string
  name: string | null
  first_name: string | null
  last_name: string | null
  image: string | null
  role: UserRole
  permissions: PermissionMap
  disabled: boolean
  two_factor_enabled: boolean | null
  created_at: string | null
  updated_at: string | null
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return isNaN(date.getTime()) ? null : date.toISOString()
}

/** Map a DB user row to the API response shape (permissions are effective). */
export function mapUserRow(row: DbUserRow): AdminUserResponse {
  const role: UserRole = row.role === 'admin' ? 'admin' : 'user'
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    first_name: row.firstName,
    last_name: row.lastName,
    image: row.image,
    role,
    permissions: resolvePermissions(role, row.permissions),
    disabled: row.disabled === true,
    two_factor_enabled: row.twoFactorEnabled,
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  }
}

/** Active (non-disabled) admins other than the given user. */
export async function countOtherActiveAdmins(client: PoolClient, excludeUserId: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM "user" WHERE "role" = 'admin' AND "disabled" = FALSE AND "id" <> $1`,
    [excludeUserId]
  )
  return parseInt(rows[0]?.count ?? '0', 10)
}

/** Revoke every session of a user (used on disable and password change). */
export async function revokeUserSessions(client: PoolClient, userId: string): Promise<void> {
  await client.query('DELETE FROM "session" WHERE "userId" = $1', [userId])
}

/** Display name from first/last, falling back to the email local part. */
export function buildDisplayName(firstName: string | null, lastName: string | null, email: string): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || email.split('@')[0]
}
