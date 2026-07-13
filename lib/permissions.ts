// Permission model for the multi-user system.
//
// Roles: 'admin' | 'user'. Admins implicitly hold every permission — their
// stored `permissions` JSONB is ignored. Users resolve each key from their
// stored grants, falling back to PERMISSION_DEFAULTS for missing keys, so
// adding a new permission later needs no data migration: existing users pick
// up its default automatically.
//
// The authoritative source is always the DB `user` row (loaded by
// getAuthenticatedUser), never the session payload — session cookies are
// cached for 5 minutes and would otherwise serve stale grants.

export type UserRole = 'admin' | 'user'

export const PERMISSION_KEYS = [
  'manage_users',
  'manage_admins',
  'manage_modules',
  'access_settings',
  'generate_api_keys',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export type PermissionMap = Record<PermissionKey, boolean>

/** Defaults applied when a user's stored permissions omit a key. */
export const PERMISSION_DEFAULTS: PermissionMap = {
  manage_users: false,
  manage_admins: false,
  manage_modules: true,
  access_settings: true,
  generate_api_keys: false,
}

/** UI metadata for the Users page permission toggles. */
export const PERMISSION_INFO: Record<PermissionKey, { label: string; description: string }> = {
  manage_users: {
    label: 'Manage users',
    description: 'Add, edit, disable and delete accounts with the User role (via UI or API).',
  },
  manage_admins: {
    label: 'Manage admins',
    description: 'Add, edit, disable and delete Admin accounts (including the first one), and change roles.',
  },
  manage_modules: {
    label: 'Manage modules',
    description: 'Enable and disable modules on the Modules page.',
  },
  access_settings: {
    label: 'Access settings',
    description: 'Open the Settings page.',
  },
  generate_api_keys: {
    label: 'Generate API keys',
    description: 'Create API keys for external access.',
  },
}

/**
 * Resolve a user's effective permissions from their role + stored JSONB.
 * Admins get everything; users get stored value or the key's default.
 */
export function resolvePermissions(role: string, stored: unknown): PermissionMap {
  const resolved = {} as PermissionMap
  const grants = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  for (const key of PERMISSION_KEYS) {
    resolved[key] =
      role === 'admin' ? true : typeof grants[key] === 'boolean' ? (grants[key] as boolean) : PERMISSION_DEFAULTS[key]
  }
  return resolved
}

/** Keep only known permission keys with boolean values from untrusted input. */
export function sanitizePermissionInput(input: unknown): Partial<PermissionMap> {
  const out: Partial<PermissionMap> = {}
  if (input && typeof input === 'object') {
    for (const key of PERMISSION_KEYS) {
      const value = (input as Record<string, unknown>)[key]
      if (typeof value === 'boolean') out[key] = value
    }
  }
  return out
}

/** Minimal shape checks accept — matches the user object from getAuthenticatedUser(). */
export type PermissionActor = {
  role: UserRole
  permissions: PermissionMap
}

export function hasPermission(actor: PermissionActor | null | undefined, key: PermissionKey): boolean {
  if (!actor) return false
  if (actor.role === 'admin') return true
  return actor.permissions[key] === true
}

/**
 * Which permission is needed to manage (create/edit/disable/delete) an
 * account of the given role. manage_admins also covers user-role targets —
 * anyone trusted with admins is implicitly trusted with users.
 */
export function canManageRole(actor: PermissionActor | null | undefined, targetRole: UserRole): boolean {
  if (targetRole === 'admin') return hasPermission(actor, 'manage_admins')
  return hasPermission(actor, 'manage_users') || hasPermission(actor, 'manage_admins')
}

/** Whether the actor may open the Users page / list accounts at all. */
export function canViewUsers(actor: PermissionActor | null | undefined): boolean {
  return hasPermission(actor, 'manage_users') || hasPermission(actor, 'manage_admins')
}

/**
 * Whether `actor` may manage `target` — edit, reset password, disable, delete.
 *
 * Requires role scope (canManageRole), AND, for a manage_users-only actor,
 * that the target holds no permission the actor lacks. Without the second
 * rule a manage_users actor could reset the password of (or disable/delete) a
 * user-role account that carries manage_admins, sign in as it, and escalate.
 * manage_admins holders are intentionally all-powerful (they can already mint
 * admin accounts), and admins hold every permission, so both pass freely.
 *
 * `target.permissions` must be the EFFECTIVE map (run resolvePermissions).
 */
export function canManageUser(
  actor: PermissionActor | null | undefined,
  target: { role: UserRole; permissions: PermissionMap }
): boolean {
  if (!canManageRole(actor, target.role)) return false
  if (hasPermission(actor, 'manage_admins')) return true
  return PERMISSION_KEYS.every((key) => !target.permissions[key] || hasPermission(actor, key))
}
