import { describe, it, expect } from 'vitest'
import {
  PERMISSION_KEYS,
  PERMISSION_DEFAULTS,
  resolvePermissions,
  sanitizePermissionInput,
  hasPermission,
  canManageRole,
  canViewUsers,
  canManageUser,
  type PermissionActor,
  type PermissionMap,
} from '@/lib/permissions'

// ─── resolvePermissions ────────────────────────────────────────────────────

describe('resolvePermissions — admin role', () => {
  it('grants every permission for admin regardless of stored grants', () => {
    const result = resolvePermissions('admin', {})
    for (const key of PERMISSION_KEYS) {
      expect(result[key]).toBe(true)
    }
  })

  it('grants every permission for admin even if stored grants say false', () => {
    const stored = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]))
    const result = resolvePermissions('admin', stored)
    for (const key of PERMISSION_KEYS) {
      expect(result[key]).toBe(true)
    }
  })

  it('grants every permission for admin when stored is null', () => {
    const result = resolvePermissions('admin', null)
    for (const key of PERMISSION_KEYS) {
      expect(result[key]).toBe(true)
    }
  })
})

describe('resolvePermissions — user role', () => {
  it('returns stored boolean values when present', () => {
    const stored = {
      manage_users: true,
      manage_admins: true,
      manage_modules: false,
      access_settings: false,
      generate_api_keys: true,
    }
    const result = resolvePermissions('user', stored)
    expect(result.manage_users).toBe(true)
    expect(result.manage_admins).toBe(true)
    expect(result.manage_modules).toBe(false)
    expect(result.access_settings).toBe(false)
    expect(result.generate_api_keys).toBe(true)
  })

  it('falls back to PERMISSION_DEFAULTS when key is missing', () => {
    const result = resolvePermissions('user', {})
    for (const key of PERMISSION_KEYS) {
      expect(result[key]).toBe(PERMISSION_DEFAULTS[key])
    }
  })

  it('ignores non-boolean stored values and falls back to defaults', () => {
    const stored = {
      manage_users: 'yes',      // string, not boolean
      manage_admins: 1,          // number, not boolean
      manage_modules: null,      // null
    }
    const result = resolvePermissions('user', stored)
    expect(result.manage_users).toBe(PERMISSION_DEFAULTS.manage_users)
    expect(result.manage_admins).toBe(PERMISSION_DEFAULTS.manage_admins)
    expect(result.manage_modules).toBe(PERMISSION_DEFAULTS.manage_modules)
  })

  it('falls back to defaults when stored is a non-object primitive', () => {
    const result = resolvePermissions('user', 'bad')
    for (const key of PERMISSION_KEYS) {
      expect(result[key]).toBe(PERMISSION_DEFAULTS[key])
    }
  })

  it('falls back to defaults when stored is undefined', () => {
    const result = resolvePermissions('user', undefined)
    for (const key of PERMISSION_KEYS) {
      expect(result[key]).toBe(PERMISSION_DEFAULTS[key])
    }
  })

  it('treats unknown role the same as user', () => {
    const result = resolvePermissions('superuser', {})
    // Unknown role: not admin, so uses stored / defaults
    expect(result.manage_users).toBe(PERMISSION_DEFAULTS.manage_users)
    expect(result.access_settings).toBe(PERMISSION_DEFAULTS.access_settings)
  })
})

describe('PERMISSION_DEFAULTS values', () => {
  it('manage_users defaults to false', () => {
    expect(PERMISSION_DEFAULTS.manage_users).toBe(false)
  })
  it('manage_admins defaults to false', () => {
    expect(PERMISSION_DEFAULTS.manage_admins).toBe(false)
  })
  it('manage_modules defaults to true', () => {
    expect(PERMISSION_DEFAULTS.manage_modules).toBe(true)
  })
  it('access_settings defaults to true', () => {
    expect(PERMISSION_DEFAULTS.access_settings).toBe(true)
  })
  it('generate_api_keys defaults to false', () => {
    expect(PERMISSION_DEFAULTS.generate_api_keys).toBe(false)
  })
})

// ─── sanitizePermissionInput ───────────────────────────────────────────────

describe('sanitizePermissionInput', () => {
  it('returns empty object for null input', () => {
    expect(sanitizePermissionInput(null)).toEqual({})
  })

  it('returns empty object for non-object input', () => {
    expect(sanitizePermissionInput('string')).toEqual({})
    expect(sanitizePermissionInput(42)).toEqual({})
    expect(sanitizePermissionInput(true)).toEqual({})
    expect(sanitizePermissionInput(undefined)).toEqual({})
  })

  it('keeps only known keys with boolean values', () => {
    const input = {
      manage_users: true,
      manage_admins: false,
      unknown_key: true,        // unknown key — stripped
      manage_modules: 'yes',    // non-boolean — stripped
      access_settings: 1,       // non-boolean — stripped
      generate_api_keys: true,
    }
    const result = sanitizePermissionInput(input)
    expect(result).toEqual({
      manage_users: true,
      manage_admins: false,
      generate_api_keys: true,
    })
    expect('unknown_key' in result).toBe(false)
    expect('manage_modules' in result).toBe(false)
    expect('access_settings' in result).toBe(false)
  })

  it('returns empty object for empty object input', () => {
    expect(sanitizePermissionInput({})).toEqual({})
  })

  it('handles all boolean false values correctly', () => {
    const input = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]))
    const result = sanitizePermissionInput(input)
    for (const key of PERMISSION_KEYS) {
      expect(result[key]).toBe(false)
    }
  })
})

// ─── hasPermission ─────────────────────────────────────────────────────────

function makeAdmin(): PermissionActor {
  return {
    role: 'admin',
    permissions: resolvePermissions('admin', {}),
  }
}

function makeUser(overrides: Partial<PermissionMap> = {}): PermissionActor {
  return {
    role: 'user',
    permissions: { ...resolvePermissions('user', {}), ...overrides },
  }
}

describe('hasPermission', () => {
  it('returns false for null actor', () => {
    expect(hasPermission(null, 'manage_users')).toBe(false)
  })

  it('returns false for undefined actor', () => {
    expect(hasPermission(undefined, 'manage_users')).toBe(false)
  })

  it('returns true for admin on every permission key', () => {
    const admin = makeAdmin()
    for (const key of PERMISSION_KEYS) {
      expect(hasPermission(admin, key)).toBe(true)
    }
  })

  it('returns true for user with permission granted', () => {
    const user = makeUser({ manage_users: true })
    expect(hasPermission(user, 'manage_users')).toBe(true)
  })

  it('returns false for user without permission', () => {
    const user = makeUser({ manage_users: false })
    expect(hasPermission(user, 'manage_users')).toBe(false)
  })

  it('respects default false for generate_api_keys', () => {
    const user = makeUser()
    expect(hasPermission(user, 'generate_api_keys')).toBe(false)
  })

  it('respects default true for access_settings', () => {
    const user = makeUser()
    expect(hasPermission(user, 'access_settings')).toBe(true)
  })
})

// ─── canManageRole ─────────────────────────────────────────────────────────

describe('canManageRole', () => {
  it('returns false for null actor', () => {
    expect(canManageRole(null, 'user')).toBe(false)
    expect(canManageRole(null, 'admin')).toBe(false)
  })

  it('admin can manage user role', () => {
    expect(canManageRole(makeAdmin(), 'user')).toBe(true)
  })

  it('admin can manage admin role', () => {
    expect(canManageRole(makeAdmin(), 'admin')).toBe(true)
  })

  it('user with manage_users can manage user role', () => {
    const actor = makeUser({ manage_users: true })
    expect(canManageRole(actor, 'user')).toBe(true)
  })

  it('user with manage_admins can manage user role', () => {
    const actor = makeUser({ manage_admins: true })
    expect(canManageRole(actor, 'user')).toBe(true)
  })

  it('user with manage_admins can manage admin role', () => {
    const actor = makeUser({ manage_admins: true })
    expect(canManageRole(actor, 'admin')).toBe(true)
  })

  it('user with only manage_users cannot manage admin role', () => {
    const actor = makeUser({ manage_users: true, manage_admins: false })
    expect(canManageRole(actor, 'admin')).toBe(false)
  })

  it('user with no relevant permissions cannot manage either role', () => {
    const actor = makeUser({ manage_users: false, manage_admins: false })
    expect(canManageRole(actor, 'user')).toBe(false)
    expect(canManageRole(actor, 'admin')).toBe(false)
  })
})

// ─── canViewUsers ──────────────────────────────────────────────────────────

describe('canViewUsers', () => {
  it('returns false for null actor', () => {
    expect(canViewUsers(null)).toBe(false)
  })

  it('admin can view users', () => {
    expect(canViewUsers(makeAdmin())).toBe(true)
  })

  it('user with manage_users can view users', () => {
    expect(canViewUsers(makeUser({ manage_users: true }))).toBe(true)
  })

  it('user with manage_admins can view users', () => {
    expect(canViewUsers(makeUser({ manage_admins: true }))).toBe(true)
  })

  it('user with neither permission cannot view users', () => {
    const actor = makeUser({ manage_users: false, manage_admins: false })
    expect(canViewUsers(actor)).toBe(false)
  })
})

// ─── canManageUser ─────────────────────────────────────────────────────────

describe('canManageUser', () => {
  const allFalse: PermissionMap = resolvePermissions('user', Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])))
  const allTrue: PermissionMap = resolvePermissions('admin', {})

  it('returns false for null actor', () => {
    expect(canManageUser(null, { role: 'user', permissions: allFalse })).toBe(false)
  })

  it('admin can manage any user', () => {
    expect(canManageUser(makeAdmin(), { role: 'user', permissions: allFalse })).toBe(true)
  })

  it('admin can manage other admins', () => {
    expect(canManageUser(makeAdmin(), { role: 'admin', permissions: allTrue })).toBe(true)
  })

  it('user with manage_admins can manage admin targets', () => {
    const actor = makeUser({ manage_admins: true })
    expect(canManageUser(actor, { role: 'admin', permissions: allTrue })).toBe(true)
  })

  it('user with manage_users can manage a plain user with no elevated permissions', () => {
    const actor = makeUser({ manage_users: true })
    const target = { role: 'user' as const, permissions: allFalse }
    expect(canManageUser(actor, target)).toBe(true)
  })

  it('user with only manage_users cannot manage a user that has manage_users (escalation prevention)', () => {
    // Target has manage_users=true but actor does not hold manage_admins
    // Escalation: if actor resets target's password, target could then log in and have manage_users
    // But here the check is: actor needs to hold every permission that target has.
    // actor has manage_users (true) so key check passes for that.
    // Let's check target with manage_admins=true which actor does NOT hold:
    const actor = makeUser({ manage_users: true, manage_admins: false })
    const targetPermissions: PermissionMap = {
      ...allFalse,
      manage_admins: true,  // target has this, actor does not
    }
    const target = { role: 'user' as const, permissions: targetPermissions }
    expect(canManageUser(actor, target)).toBe(false)
  })

  it('user with only manage_users can manage target that only has access_settings (actor also has it)', () => {
    // access_settings defaults to true for actor too (manage_users actor gets defaults)
    const actor = makeUser({ manage_users: true })
    const targetPermissions: PermissionMap = {
      ...allFalse,
      access_settings: true,
      manage_modules: true,  // actor also has manage_modules=true by default
    }
    const target = { role: 'user' as const, permissions: targetPermissions }
    expect(canManageUser(actor, target)).toBe(true)
  })

  it('user with no permissions cannot manage anyone', () => {
    const actor = makeUser({ manage_users: false, manage_admins: false })
    expect(canManageUser(actor, { role: 'user', permissions: allFalse })).toBe(false)
  })

  it('canManageRole failure short-circuits before privilege-escalation check', () => {
    // actor with manage_users tries to manage an admin — canManageRole fails first
    const actor = makeUser({ manage_users: true, manage_admins: false })
    expect(canManageUser(actor, { role: 'admin', permissions: allTrue })).toBe(false)
  })
})
